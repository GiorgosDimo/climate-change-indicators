'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  INDICATORS, fmtFor, frameUrl, framesFor, monthList, variantFor, type BBox, type Mode,
} from '@/lib/indicators';
import { formatValue } from '@/lib/format';
import { loadColormap, loadFrame, type Colormap } from '@/lib/frames';
import { ORIGINAL, PALETTES, legendStops, type Palette, type PaletteId } from '@/lib/palette';
import { MIN_POINTS, addPoint, pointsOf, type Series } from '@/lib/series';
import { findNewEnds, loadState, saveState } from '@/lib/updates';
import type { Hover } from '@/components/GlobeView';
import RangeSlider from '@/components/RangeSlider';
import TimeDock from '@/components/TimeDock';
import TrendChart from '@/components/TrendChart';

const GlobeView = dynamic(() => import('@/components/GlobeView'), { ssr: false });
const AHEAD = 6;      // frames fetched in advance while scrubbing/playing
const REST_MS = 500;  // pointer must rest this long on a pixel before its values are collected
const MODES: [Mode, string][] = [['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Yearly']];

export default function Home() {
  const [indId, setIndId] = useState(INDICATORS[0].id);
  const [ends, setEnds] = useState<Record<string, string>>({});
  const [snack, setSnack] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<Mode>('month');
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(3);
  const [hover, setHover] = useState<Hover | null>(null);
  const [values, setValues] = useState(true);
  const [data, setData] = useState<{ key: string; pts: Series }>({ key: '', pts: {} }); // values seen per map cell
  const [focus, setFocus] = useState<{ cell: string; lat: number; lon: number } | null>(null); // cell the graph is about
  const [closed, setClosed] = useState<string | null>(null); // cell whose graph the user dismissed
  const [palettes, setPalettes] = useState<Record<string, Palette>>({}); // chosen colours, per indicator
  const [cm, setCm] = useState<Colormap | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rest = useRef<string | null>(null); // cell the pointer has been resting on

  // A newer-data check can push an indicator's last month forward.
  const base = INDICATORS.find(i => i.id === indId)!;
  const ind = useMemo(() => {
    const end = ends[base.id] ?? base.end;
    const weekly = base.weekly && { ...base.weekly, end: base.weekly.end > end ? base.weekly.end : end };
    return { ...base, end, weekly };
  }, [base, ends]);
  const m: Mode = mode === 'week' && !ind.weekly ? 'month' : mode;
  const variant = variantFor(ind, m);
  const palette = palettes[ind.id] ?? ORIGINAL;

  const months = useMemo(() => monthList(ind.start, ind.end), [ind]);
  const [range, setRange] = useState<[number, number]>([0, months.length - 1]);
  useEffect(() => { setRange([0, months.length - 1]); }, [months]);

  const dates = useMemo(() => framesFor(ind, months.slice(range[0], range[1] + 1), m), [ind, months, range, m]);
  const urls = useMemo(() => dates.map(d => frameUrl(variant.layer, d, ind.res)), [dates, variant, ind.res]);
  const safe = Math.min(idx, Math.max(dates.length - 1, 0));
  const format = useCallback((v: number, u: string) => formatValue(variant, v, u), [variant]);
  const detailUrl = useCallback((box: BBox, w: number, h: number) =>
    dates[safe] ? frameUrl(variant.layer, dates[safe], w, box, h) : null, [dates, safe, variant]);

  useEffect(() => { setIdx(0); setPlaying(false); }, [dates]);

  useEffect(() => {
    let dead = false;
    setCm(null);
    loadColormap(variant.colormap).then(c => { if (!dead) setCm(c); }).catch(() => {});
    return () => { dead = true; };
  }, [variant.colormap]);

  // Fetch the next few frames so playback never waits on the network.
  useEffect(() => {
    for (let i = safe; i <= safe + AHEAD && i < urls.length; i++) loadFrame(urls[i]).catch(() => {});
  }, [safe, urls]);

  // Advance only once the next frame has arrived (a missing frame is skipped).
  useEffect(() => {
    if (!playing || urls.length < 2) return;
    let dead = false;
    const t = setTimeout(async () => {
      const n = (safe + 1) % urls.length;
      await loadFrame(urls[n]).catch(() => {});
      if (!dead) setIdx(n);
    }, 1000 / fps);
    return () => { dead = true; clearTimeout(t); };
  }, [playing, safe, fps, urls]);

  // Every time the app opens, look for months published since the last visit.
  useEffect(() => {
    const known = loadState().ends;
    setEnds(known);
    findNewEnds(INDICATORS, known).then(found => {
      const names = Object.keys(found).map(id => INDICATORS.find(i => i.id === id)!.name);
      if (!names.length) return;
      const next = { ...known, ...found };
      saveState({ ends: next });
      setEnds(next);
      setSnack(`New data available: ${names.join(', ')}`);
    });
  }, []);

  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(() => setSnack(null), 8000);
    return () => clearTimeout(t);
  }, [snack]);

  // A menu taller than half the screen hides the globe: tapping anywhere outside it collapses it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const el = menuRef.current;
      if (el && el.offsetHeight > window.innerHeight / 2 && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  // Collect the value at the pixel under the pointer for every frame it sees; the graph grows as frames play.
  const seriesKey = `${variant.layer}|${m}`;
  useEffect(() => { setFocus(null); }, [seriesKey]);
  useEffect(() => {
    if (!hover) { rest.current = null; return; }
    const date = dates[urls.indexOf(hover.src)];
    if (hover.num === null || !date) return;
    const cell = hover.cell.join(',');
    const save = () => {
      setData(d => ({ key: seriesKey, pts: addPoint(d.key === seriesKey ? d.pts : {}, cell, date, hover.num!) }));
      setFocus(f => (f?.cell === cell ? f : { cell, lat: hover.cell[0], lon: hover.cell[1] }));
    };
    if (rest.current === cell) { save(); return; }
    const t = setTimeout(() => { rest.current = cell; save(); }, REST_MS);
    return () => clearTimeout(t);
  }, [hover]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPalette = (p: Partial<Palette>) => setPalettes(s => ({ ...s, [ind.id]: { ...palette, ...p } }));

  const label = dates[safe] ? fmtFor(dates[safe], m) : '';
  const tipLeft = hover ? Math.max(8, Math.min(hover.x + 14, window.innerWidth - 208)) : 0; // shortcut: assumes tooltip <= 200px wide
  const bins = cm?.bins ?? [];
  const fmt = (v: number) => formatValue(variant, v, cm?.units ?? '');
  const legend = cm && bins.length > 1 ? {
    bg: `linear-gradient(to right, ${legendStops(cm, palette).join(',')})`,
    min: fmt(bins[0].value),
    max: fmt(bins[bins.length - 1].value),
  } : null;
  const pts = focus && data.key === seriesKey ? pointsOf(data.pts, focus.cell) : [];
  const showChart = !!focus && values && pts.length >= MIN_POINTS && focus.cell !== closed;
  const marker: [number, number] | null = !values ? null : hover ? hover.cell : focus && [focus.lat, focus.lon];

  return (
    <main className={showChart ? 'with-chart' : undefined}>
      <GlobeView src={urls[safe] ?? null} detailUrl={detailUrl} colormap={variant.colormap} format={format}
        alpha={ind.alpha} palette={palette} north={!!ind.north} onHover={setHover}
        values={values} onValues={setValues} marker={marker} />

      {hover && (
        <div className="panel tip" style={{ left: tipLeft, top: hover.y + 14 }}>
          <b>{hover.value}</b>
          <span className="cap muted">{hover.lat.toFixed(1)}°, {hover.lon.toFixed(1)}°</span>
        </div>
      )}

      <div className="panel menu" ref={menuRef}>
        <div className="menu-head" onClick={() => setOpen(o => !o)}>
          <button className="icon" aria-label="Toggle menu" aria-expanded={open}>
            <svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" /></svg>
          </button>
          <div>
            <h1>Climate Change Indicators</h1>
            {!open && (
              <div className="cap muted ellip" data-testid="collapsed-name">{ind.name}{label ? ` · ${label}` : ''}</div>
            )}
          </div>
        </div>

        {open && (
          <div className="menu-body">
            <label className="field">
              <span>Climate indicator</span>
              <select value={indId} onChange={e => setIndId(e.target.value)}>
                {INDICATORS.map((i, n) => <option key={i.id} value={i.id}>{n + 1}. {i.name}</option>)}
              </select>
            </label>

            <div>
              <p>{ind.about}</p>
              <p style={{ marginTop: 8 }}><b>How to read it:</b> {ind.howto}</p>
              <p className="cap muted" style={{ marginTop: 8, fontStyle: 'italic' }}>{ind.note}</p>
            </div>

            <div className="row">
              <label className="field">
                <span>Colours</span>
                <select value={palette.id} onChange={e => setPalette({ id: e.target.value as PaletteId })}>
                  {PALETTES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
              {palette.id === 'custom' && (['low', 'high'] as const).map(k => (
                <input key={k} className="swatch" type="color" value={palette[k]} aria-label={`${k === 'low' ? 'Low' : 'High'} colour`}
                  onChange={e => setPalette({ [k]: e.target.value })} />
              ))}
            </div>

            <div className="seg" role="group" aria-label="Time step">
              {MODES.map(([k, text]) => (
                <button key={k} aria-pressed={m === k} disabled={k === 'week' && !ind.weekly} onClick={() => setMode(k)}>{text}</button>
              ))}
            </div>

            <div>
              <span className="cap muted">Period</span>
              <RangeSlider min={0} max={months.length - 1} value={range} onChange={setRange} labels={['Period start', 'Period end']} />
              <div className="bounds cap muted">
                <span>{fmtFor(months[0], m)}</span>
                <span>{fmtFor(months[months.length - 1], m)}</span>
              </div>
            </div>
            <span className="cap muted">Imagery: NASA GIBS</span>
          </div>
        )}
        {/* outside the scrolling area so it is always in view */}
        {open && <p className="tip-text">Tip: press Play below to watch how this indicator changes over time.</p>}
      </div>

      <TimeDock legend={legend} label={label} frames={dates.length} index={safe} playing={playing} fps={fps}
        onSeek={i => { setPlaying(false); setIdx(i); }} onPlay={() => setPlaying(p => !p)} onFps={setFps}
        chart={showChart && focus && (
          <TrendChart title={`${focus.lat.toFixed(2)}°, ${focus.lon.toFixed(2)}°`} points={pts} current={dates[safe]}
            fmt={fmt} label={d => fmtFor(d, m)} onClose={() => setClosed(focus.cell)} />
        )} />

      {snack && (
        <div className="snack" role="status">
          <span>{snack}</span>
          <button aria-label="Close" onClick={() => setSnack(null)}>×</button>
        </div>
      )}
    </main>
  );
}
