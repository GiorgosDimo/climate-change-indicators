interface Props {
  min: number; max: number; value: [number, number]; onChange: (v: [number, number]) => void;
  labels: [string, string]; // aria labels of the two thumbs
}

/** Two-thumb slider built from two stacked native range inputs. */
export default function RangeSlider({ min, max, value: [a, b], onChange, labels }: Props) {
  const at = (n: number) => (n - min) / Math.max(max - min, 1);
  const pos = (f: number) => `calc((100% - 14px) * ${f} + 7px)`; // thumb centres travel 7px inside the rail
  return (
    <div className="tg-range">
      <div className="tg-rail" />
      <div className="tg-fill" style={{ left: pos(at(a)), width: `calc((100% - 14px) * ${at(b) - at(a)})` }} />
      {/* shortcut: the start thumb is raised once past the middle so it stays draggable when both sit at the far right */}
      <input type="range" min={min} max={max} value={a} aria-label={labels[0]} style={{ zIndex: at(a) > 0.5 ? 2 : 1 }}
        onChange={e => onChange([Math.min(+e.target.value, b), b])} />
      <input type="range" min={min} max={max} value={b} aria-label={labels[1]}
        onChange={e => onChange([a, Math.max(+e.target.value, a)])} />
    </div>
  );
}
