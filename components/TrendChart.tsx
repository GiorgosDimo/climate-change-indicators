import { MIN_POINTS } from '@/lib/series';

interface Props {
  title: string; points: { date: string; value: number }[]; current?: string;
  fmt: (v: number) => string; label: (date: string) => string; onClose: () => void;
}

const W = 300, H = 64;

/** Minimal line graph of one cell's values over time. */
export default function TrendChart({ title, points, current, fmt, label, onClose }: Props) {
  if (points.length < MIN_POINTS) {
    return (
      <div className="chart" data-testid="trend-hint">
        <div className="chart-head">
          <span>Flag at {title}</span>
          <button aria-label="Close graph" onClick={onClose}>×</button>
        </div>
        <p className="cap muted">{points.length} of {MIN_POINTS} frames collected. Press Play or drag the time slider to build the graph.</p>
      </div>
    );
  }
  const t = points.map(p => Date.parse(p.date));
  const [t0, t1] = [t[0], t[t.length - 1]];
  const lo = Math.min(...points.map(p => p.value)), hi = Math.max(...points.map(p => p.value));
  const x = (ms: number) => (t1 === t0 ? 0 : ((ms - t0) / (t1 - t0)) * W);
  const y = (v: number) => (hi === lo ? H / 2 : H - 4 - ((v - lo) / (hi - lo)) * (H - 8));
  const cur = current ? x(Date.parse(current)) : null;
  return (
    <div className="chart" data-testid="trend">
      <div className="chart-head">
        <span>{title}</span>
        <button aria-label="Close graph" onClick={onClose}>×</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        {cur !== null && cur >= 0 && cur <= W && (
          <line x1={cur} x2={cur} y1={0} y2={H} stroke="#fff" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
        )}
        <polyline fill="none" stroke="#90caf9" strokeWidth={2} vectorEffect="non-scaling-stroke"
          points={points.map((p, i) => `${x(t[i])},${y(p.value)}`).join(' ')} />
      </svg>
      <div className="chart-foot muted">
        <span>{label(points[0].date)}</span>
        <span data-testid="trend-range">{fmt(lo)} – {fmt(hi)}</span>
        <span>{label(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}
