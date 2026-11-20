'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  fmtFor, frameUrl, framesFor, hasDetail, monthList, variantFor, type BBox, type Mode,
} from './lib/indicators';
import type { Catalog } from './lib/catalog';
import { formatValue } from './lib/format';
import { loadColormap, loadFrame, type Colormap } from './lib/frames';
import { ORIGINAL, PALETTES, legendStops, type Palette, type PaletteId } from './lib/palette';
import { addPoint, pointsOf, type Series } from './lib/series';
import GlobeView, { type Hover, type Sample } from './components/GlobeView';
import RangeSlider from './components/RangeSlider';
import TimeDock from './components/TimeDock';
import TrendChart from './components/TrendChart';

const AHEAD = 6; // frames fetched in advance while scrubbing/playing
const MODES: [Mode, string][] = [['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Yearly']];

export interface TimelineGlobeProps {
  catalog: Catalog;
  /** Where CesiumJS is loaded from. Defaults to the Cesium CDN; set it to self-host. */
  cesiumUrl?: string;
  className?: string;
  /** The viewer fills its container, so give it (or its parent) a size. */
  style?: CSSProperties;
}

/** A globe that plays the catalog's datasets through time, with menu, legend, value picker and trend graph. */
export default function TimelineGlobe({ catalog, cesiumUrl, className, style }: TimelineGlobeProps) {
  const [indId, setIndId] = useState(catalog.indicators[0].id);
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<Mode>('month');
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(3);
  const [hover, setHover] = useState<Hover | null>(null);
  const [values, setValues] = useState(true);
  const [minimized, setMinimized] = useState(false); // trend graph collapsed to its title bar
  const [pin, setPin] = useState<[number, number] | null>(null); // flagged pixel
  const [sample, setSample] = useState<Sample | null>(null);
  const [data, setData] = useState<{ key: string; pts: Series }>({ key: '', pts: {} }); // values seen per map cell
  const [palettes, setPalettes] = useState<Record<string, Palette>>({}); // chosen colours, per indicator
  const [cm, setCm] = useState<Colormap | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const ind = catalog.indicators.find(i => i.id === indId) ?? catalog.indicators[0];
  const m: Mode = mode === 'week' && !ind.weekly ? 'month' : mode;
  const variant = variantFor(ind, m);
  const palette = palettes[ind.id] ?? ORIGINAL;

  const months = useMemo(() => monthList(ind.start, ind.end), [ind]);
  const [range, setRange] = useState<[number, number]>([0, months.length - 1]);
  useEffect(() => { setRange([0, months.length - 1]); }, [months]);

  const dates = useMemo(() => framesFor(ind, months.slice(range[0], range[1] + 1), m), [ind, months, range, m]);
  const urls = useMemo(() => dates.map(d => frameUrl(variant, d, ind.res)), [dates, variant, ind.res]);
  const safe = Math.min(idx, Math.max(dates.length - 1, 0));
  const format = useCallback((v: number, u: string) => formatValue(variant, v, u), [variant]);
  const detailUrl = useCallback((box: BBox, w: number, h: number) =>
    dates[safe] && hasDetail(variant) ? frameUrl(variant, dates[safe], w, box, h) : null, [dates, safe, variant]);

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

  // A menu that hides much of the globe (always, on a phone-width viewer) collapses when you tap anywhere outside it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const el = menuRef.current, root = rootRef.current;
      const covers = !!root && (root.clientWidth < 600 && root.clientWidth > 0 || (el?.offsetHeight ?? 0) > root.clientHeight * 0.4);
      if (el && covers && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  // Every frame shown at the flagged pixel adds one point; the graph grows as frames play or are scrubbed.
  // Weekly, monthly and yearly are separate series (their frames differ), so switching starts a new graph.
  const seriesKey = `${variant.layer}|${m}`;
  useEffect(() => {
    const date = sample && dates[urls.indexOf(sample.src)];
    if (!sample || sample.num === null || !date) return;
    setData(d => ({ key: seriesKey, pts: addPoint(d.key === seriesKey ? d.pts : {}, sample.pin.join(','), date, sample.num!) }));
  }, [sample]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPalette = (p: Partial<Palette>) => setPalettes(s => ({ ...s, [ind.id]: { ...palette, ...p } }));
  const toggleValues = (on: boolean) => { setValues(on); if (!on) setPin(null); };

  const label = dates[safe] ? fmtFor(dates[safe], m) : '';
  const tipLeft = hover ? Math.max(8, Math.min(hover.x + 14, (rootRef.current?.clientWidth ?? 400) - 208)) : 0; // shortcut: assumes tooltip <= 200px wide
  const bins = cm?.bins ?? [];
  const fmt = (v: number) => formatValue(variant, v, cm?.units ?? '');
  const legend = cm && bins.length > 1 ? {
    bg: `linear-gradient(to right, ${legendStops(cm, palette).join(',')})`,
    min: fmt(bins[0].value),
    max: fmt(bins[bins.length - 1].value),
  } : null;
  const pts = pin && data.key === seriesKey ? pointsOf(data.pts, pin.join(',')) : [];

  return (
    <div ref={rootRef} className={['tg', pin && !minimized && 'tg-with-chart', className].filter(Boolean).join(' ')} style={style}>
      <GlobeView src={urls[safe] ?? null} detailUrl={detailUrl} colormap={variant.colormap} format={format}
        alpha={ind.alpha} palette={palette} north={!!ind.north} onHover={setHover}
        values={values} pin={pin} onPick={setPin} onSample={setSample} sampleKey={seriesKey} cesiumUrl={cesiumUrl} />

      {hover && (
        <div className="tg-panel tg-tip" style={{ left: tipLeft, top: hover.y + 14 }}>
          <b>{hover.value}</b>
          <span className="tg-cap tg-muted">{hover.lat.toFixed(1)}°, {hover.lon.toFixed(1)}°</span>
        </div>
      )}

      <div className="tg-panel tg-menu" ref={menuRef}>
        <div className="tg-menu-head" onClick={() => setOpen(o => !o)}>
          <button className="tg-icon" aria-label="Toggle menu" aria-expanded={open}>
            <svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" /></svg>
          </button>
          <div>
            <h1>{catalog.title}</h1>
            {!open && (
              <div className="tg-cap tg-muted tg-ellip" data-testid="collapsed-name">{ind.name}{label ? ` · ${label}` : ''}</div>
            )}
          </div>
        </div>

        {open && (
          <div className="tg-menu-body">
            <label className="tg-field">
              <span>Climate indicator</span>
              <select value={ind.id} onChange={e => setIndId(e.target.value)}>
                {catalog.indicators.map((i, n) => <option key={i.id} value={i.id}>{n + 1}. {i.name}</option>)}
              </select>
            </label>

            <div>
              {ind.about && <p>{ind.about}</p>}
              {ind.howto && <p style={{ marginTop: 8 }}><b>How to read it:</b> {ind.howto}</p>}
              {ind.note && <p className="tg-cap tg-muted" style={{ marginTop: 8, fontStyle: 'italic' }}>{ind.note}</p>}
            </div>

            <div className="tg-row">
              <label className="tg-field">
                <span>Colours</span>
                <select value={palette.id} onChange={e => setPalette({ id: e.target.value as PaletteId })}>
                  {PALETTES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
              {palette.id === 'custom' && (['low', 'high'] as const).map(k => (
                <input key={k} className="tg-swatch" type="color" value={palette[k]} aria-label={`${k === 'low' ? 'Low' : 'High'} colour`}
                  onChange={e => setPalette({ [k]: e.target.value })} />
              ))}
            </div>

            <div>
              <span className="tg-cap tg-muted">Period</span>
              <RangeSlider min={0} max={months.length - 1} value={range} onChange={setRange} labels={['Period start', 'Period end']} />
              <div className="tg-bounds tg-cap tg-muted">
                <span>{fmtFor(months[0], m)}</span>
                <span>{fmtFor(months[months.length - 1], m)}</span>
              </div>
            </div>
            {catalog.credit && <span className="tg-cap tg-muted">{catalog.credit}</span>}
          </div>
        )}
        {/* these two sit outside the scrolling area so they are always in view */}
        {open && (
          <div className="tg-menu-pin">
            <div className="tg-seg" role="group" aria-label="Time step">
              {MODES.map(([k, text]) => (
                <button key={k} aria-pressed={m === k} disabled={k === 'week' && !ind.weekly} onClick={() => setMode(k)}>{text}</button>
              ))}
            </div>
          </div>
        )}
        {open && <p className="tg-tip-text">Tip: press Play below to watch how this indicator changes over time.</p>}
      </div>

      <TimeDock legend={legend} label={label} frames={dates.length} index={safe} playing={playing} fps={fps}
        values={values} onValues={toggleValues}
        onSeek={i => { setPlaying(false); setIdx(i); }} onPlay={() => setPlaying(p => !p)} onFps={setFps}
        chart={pin && (
          <TrendChart title={`${pin[0].toFixed(2)}°, ${pin[1].toFixed(2)}°`} points={pts} current={dates[safe]}
            fmt={fmt} label={d => fmtFor(d, m)} minimized={minimized} onToggle={() => setMinimized(v => !v)} />
        )} />
    </div>
  );
}
