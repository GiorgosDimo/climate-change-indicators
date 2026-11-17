import { Box, Button, Paper, Slider, Typography } from '@mui/material';

export interface LegendData { bg: string; min: string; max: string }
interface Props {
  legend: LegendData | null; label: string; frames: number; index: number; playing: boolean; fps: number;
  onSeek: (i: number) => void; onPlay: () => void; onFps: (n: number) => void;
}

/** Bottom dock: legend, time slider, play and speed. Sliders flex so they fit a phone. */
export default function TimeDock({ legend, label, frames, index, playing, fps, onSeek, onPlay, onFps }: Props) {
  return (
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
      {frames === 0 ? (
        <Typography color="error" variant="body2">No frames in this period.</Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography data-testid="frame-date" sx={{ minWidth: 88, fontVariantNumeric: 'tabular-nums' }}>{label}</Typography>
            <Slider size="small" sx={{ flex: 1, minWidth: 0 }} min={0} max={Math.max(frames - 1, 1)} value={index} aria-label="Frame"
              onChange={(_, v) => onSeek(v as number)} />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button variant="contained" size="small" sx={{ minWidth: 88 }} onClick={onPlay}>{playing ? 'Pause' : 'Play'}</Button>
            <Slider size="small" sx={{ flex: 1, minWidth: 0 }} min={1} max={10} step={1} value={fps} aria-label="Speed"
              onChange={(_, v) => onFps(v as number)} />
            <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>{fps} fps</Typography>
          </Box>
        </>
      )}
    </Paper>
  );
}
