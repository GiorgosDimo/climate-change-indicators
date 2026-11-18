import type { ReactNode } from 'react';

export interface LegendData { bg: string; min: string; max: string }
interface Props {
  legend: LegendData | null; label: string; frames: number; index: number; playing: boolean; fps: number;
  onSeek: (i: number) => void; onPlay: () => void; onFps: (n: number) => void;
  chart?: ReactNode; // optional trend graph shown above the legend
  values: boolean; onValues: (on: boolean) => void;
}

/** Bottom dock: trend graph, legend, time slider, play and speed. Sliders flex so they fit a phone. */
export default function TimeDock({ legend, label, frames, index, playing, fps, onSeek, onPlay, onFps, chart, values, onValues }: Props) {
  return (
    <div className="tg-panel tg-dock">
      {chart}
      <div className="tg-legend-row">
        {legend && (
          <div data-testid="legend" className="tg-legend">
            <div className="tg-legend-bar" style={{ background: legend.bg }} />
            <div className="tg-legend-ends">
              <span className="tg-ellip" data-testid="legend-min">{legend.min}</span>
              <span className="tg-ellip" data-testid="legend-max">{legend.max}</span>
            </div>
          </div>
        )}
        <button className="tg-read" aria-pressed={values} onClick={() => onValues(!values)}>
          <b>Read values</b>
          <span>{values ? 'tap globe = flag' : 'off: panning only'}</span>
        </button>
      </div>
      {frames === 0 ? (
        <p className="tg-err">No frames in this period.</p>
      ) : (
        <>
          <div className="tg-line">
            <span className="tg-date" data-testid="frame-date">{label}</span>
            <input type="range" min={0} max={Math.max(frames - 1, 1)} value={index} aria-label="Frame" onChange={e => onSeek(+e.target.value)} />
          </div>
          <div className="tg-line">
            <button className="tg-btn" onClick={onPlay}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min={1} max={10} step={1} value={fps} aria-label="Speed" onChange={e => onFps(+e.target.value)} />
            <span className="tg-nowrap">{fps} fps</span>
          </div>
        </>
      )}
    </div>
  );
}
