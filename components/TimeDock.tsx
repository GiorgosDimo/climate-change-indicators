import type { ReactNode } from 'react';

export interface LegendData { bg: string; min: string; max: string }
interface Props {
  legend: LegendData | null; label: string; frames: number; index: number; playing: boolean; fps: number;
  onSeek: (i: number) => void; onPlay: () => void; onFps: (n: number) => void;
  chart?: ReactNode; // optional trend graph shown above the legend
}

/** Bottom dock: trend graph, legend, time slider, play and speed. Sliders flex so they fit a phone. */
export default function TimeDock({ legend, label, frames, index, playing, fps, onSeek, onPlay, onFps, chart }: Props) {
  return (
    <div className="panel dock">
      {chart}
      {legend && (
        <div data-testid="legend">
          <div className="legend-bar" style={{ background: legend.bg }} />
          <div className="legend-ends">
            <span className="ellip" data-testid="legend-min">{legend.min}</span>
            <span className="ellip" data-testid="legend-max">{legend.max}</span>
          </div>
        </div>
      )}
      {frames === 0 ? (
        <p className="err">No frames in this period.</p>
      ) : (
        <>
          <div className="line">
            <span className="date" data-testid="frame-date">{label}</span>
            <input type="range" min={0} max={Math.max(frames - 1, 1)} value={index} aria-label="Frame" onChange={e => onSeek(+e.target.value)} />
          </div>
          <div className="line">
            <button className="btn" onClick={onPlay}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min={1} max={10} step={1} value={fps} aria-label="Speed" onChange={e => onFps(+e.target.value)} />
            <span className="nowrap">{fps} fps</span>
          </div>
        </>
      )}
    </div>
  );
}
