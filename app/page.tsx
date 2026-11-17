'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CssBaseline, FormControl, IconButton, InputLabel, MenuItem, Paper,
  Select, Slider, Snackbar, SvgIcon, ThemeProvider, ToggleButton, ToggleButtonGroup, Typography, createTheme,
} from '@mui/material';
import {
  INDICATORS, fmtFor, frameUrl, framesFor, monthList, variantFor, type BBox, type Mode,
} from '@/lib/indicators';
import { formatValue } from '@/lib/format';
import { loadColormap, loadFrame, type Colormap } from '@/lib/frames';
import { ORIGINAL, PALETTES, legendStops, type Palette, type PaletteId } from '@/lib/palette';
import { findNewEnds, loadState, saveState } from '@/lib/updates';
import type { Hover } from '@/components/GlobeView';

const GlobeView = dynamic(() => import('@/components/GlobeView'), { ssr: false });
const theme = createTheme({ palette: { mode: 'dark' } });
const AHEAD = 6; // frames fetched in advance while scrubbing/playing

export default function Home() {
  const [indId, setIndId] = useState(INDICATORS[0].id);
  const [ends, setEnds] = useState<Record<string, string>>({});
  const [snack, setSnack] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<Mode>('month');
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(1);
  const [hover, setHover] = useState<Hover | null>(null);
  const [palettes, setPalettes] = useState<Record<string, Palette>>({}); // chosen colours, per indicator
  const [cm, setCm] = useState<Colormap | null>(null);

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

  const setPalette = (p: Partial<Palette>) => setPalettes(s => ({ ...s, [ind.id]: { ...palette, ...p } }));

  const label = dates[safe] ? fmtFor(dates[safe], m) : '';
  const tipLeft = hover && typeof window !== 'undefined' && hover.x > window.innerWidth - 230 ? hover.x - 200 : (hover?.x ?? 0) + 14;
  const bins = cm?.bins ?? [];
  const legend = cm && bins.length > 1 ? {
    bg: `linear-gradient(to right, ${legendStops(cm, palette).join(',')})`,
    min: formatValue(variant, bins[0].value, cm.units),
    max: formatValue(variant, bins[bins.length - 1].value, cm.units),
  } : null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box component="main" sx={{ position: 'fixed', inset: 0, bgcolor: '#000' }}>
        <GlobeView src={urls[safe] ?? null} detailUrl={detailUrl} colormap={variant.colormap} format={format}
          alpha={ind.alpha} palette={palette} north={!!ind.north} onHover={setHover} />

        {hover && (
          <Paper sx={{ position: 'absolute', left: tipLeft, top: hover.y + 14, px: 1, py: 0.5, pointerEvents: 'none', zIndex: 1100 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{hover.value}</Typography>
            <Typography variant="caption" color="text.secondary">{hover.lat.toFixed(1)}°, {hover.lon.toFixed(1)}°</Typography>
          </Paper>
        )}

        <Paper sx={{ position: 'absolute', top: 8, left: 8, right: { xs: 8, sm: 'auto' }, width: { sm: 380 }, zIndex: 1000,
          opacity: 0.95, maxHeight: { xs: 'calc(100dvh - 320px)', sm: 'calc(100dvh - 210px)' }, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
            <IconButton aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
              <SvgIcon><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" /></SvgIcon>
            </IconButton>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h1" variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Climate Change Indicators
              </Typography>
              {!open && (
                <Typography variant="caption" color="text.secondary" noWrap component="div" data-testid="collapsed-name">
                  {ind.name}{label ? ` · ${label}` : ''}
                </Typography>
              )}
            </Box>
          </Box>

          {open && (
            <Box sx={{ p: 2, pt: 0.5, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <FormControl size="small" fullWidth>
                <InputLabel id="ind-label">Climate indicator</InputLabel>
                <Select labelId="ind-label" label="Climate indicator" value={indId} onChange={e => setIndId(e.target.value)}>
                  {INDICATORS.map((i, n) => <MenuItem key={i.id} value={i.id}>{n + 1}. {i.name}</MenuItem>)}
                </Select>
              </FormControl>

              <Box>
                <Typography variant="body2">{ind.about}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}><b>How to read it:</b> {ind.howto}</Typography>
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, fontStyle: 'italic' }}>{ind.note}</Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel id="pal-label">Colours</InputLabel>
                  <Select labelId="pal-label" label="Colours" value={palette.id} onChange={e => setPalette({ id: e.target.value as PaletteId })}>
                    {PALETTES.map(p => <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>)}
                  </Select>
                </FormControl>
                {palette.id === 'custom' && (['low', 'high'] as const).map(k => (
                  <Box key={k} component="input" type="color" value={palette[k]} aria-label={`${k === 'low' ? 'Low' : 'High'} colour`}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPalette({ [k]: e.target.value })}
                    sx={{ width: 40, height: 40, p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer' }} />
                ))}
              </Box>

              <ToggleButtonGroup size="small" exclusive fullWidth value={m} onChange={(_, v) => v && setMode(v)}>
                <ToggleButton value="week" disabled={!ind.weekly}>Weekly</ToggleButton>
                <ToggleButton value="month">Monthly</ToggleButton>
                <ToggleButton value="year">Yearly</ToggleButton>
              </ToggleButtonGroup>

              <Box sx={{ px: 3 }}>
                <Typography variant="caption" color="text.secondary">Period</Typography>
                <Slider size="small" min={0} max={months.length - 1} value={range} disableSwap
                  getAriaLabel={i => (i === 0 ? 'Period start' : 'Period end')}
                  onChange={(_, v) => setRange(v as [number, number])}
                  valueLabelDisplay="auto" valueLabelFormat={i => fmtFor(months[i], m)}
                  marks={[{ value: 0, label: fmtFor(months[0], m) }, { value: months.length - 1, label: fmtFor(months[months.length - 1], m) }]} />
              </Box>
              <Typography variant="caption" color="text.disabled">Imagery: NASA GIBS</Typography>
            </Box>
          )}
        </Paper>

        {/* Bottom dock: legend, time slider, play and speed. Sliders flex so they fit a phone. */}
        <Paper sx={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 1000, opacity: 0.95,
          width: 'min(560px, calc(100vw - 16px))', boxSizing: 'border-box', px: 2, py: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {legend && (
            <Box data-testid="legend">
              <Box sx={{ height: 10, borderRadius: 1, background: legend.bg }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="caption" noWrap data-testid="legend-min">{legend.min}</Typography>
                <Typography variant="caption" noWrap data-testid="legend-max">{legend.max}</Typography>
              </Box>
            </Box>
          )}
          {dates.length === 0 ? (
            <Typography color="error" variant="body2">No frames in this period.</Typography>
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography data-testid="frame-date" sx={{ minWidth: 88, fontVariantNumeric: 'tabular-nums' }}>{label}</Typography>
                <Slider size="small" sx={{ flex: 1, minWidth: 0 }} min={0} max={Math.max(dates.length - 1, 1)} value={safe} aria-label="Frame"
                  onChange={(_, v) => { setPlaying(false); setIdx(v as number); }} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button variant="contained" size="small" sx={{ minWidth: 88 }} onClick={() => setPlaying(p => !p)}>{playing ? 'Pause' : 'Play'}</Button>
                <Slider size="small" sx={{ flex: 1, minWidth: 0 }} min={1} max={10} step={1} value={fps} aria-label="Speed"
                  onChange={(_, v) => setFps(v as number)} />
                <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>{fps} fps</Typography>
              </Box>
            </>
          )}
        </Paper>

        <Snackbar open={!!snack} autoHideDuration={8000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
          <Alert severity="info" onClose={() => setSnack(null)}>{snack}</Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}
