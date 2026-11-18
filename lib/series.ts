// Values seen at one map cell over time: cell key -> frame date -> value.
export type Series = Record<string, Record<string, number>>;
export const MIN_POINTS = 5; // fewer points do not make a useful line

/** Keyed by date, so scrubbing back or looping replaces a point instead of duplicating it. */
export function addPoint(s: Series, cell: string, date: string, value: number): Series {
  return s[cell]?.[date] === value ? s : { ...s, [cell]: { ...s[cell], [date]: value } };
}

/** Least-squares line through the points against time. Null when no line exists (under 2 points or all on one date). */
export function linearFit(pts: { date: string; value: number }[]): ((ms: number) => number) | null {
  const n = pts.length;
  if (n < 2) return null;
  const t = pts.map(p => Date.parse(p.date)), tm = t.reduce((a, b) => a + b) / n, vm = pts.reduce((a, p) => a + p.value, 0) / n;
  const sxx = t.reduce((a, x) => a + (x - tm) ** 2, 0);
  if (sxx === 0) return null;
  const slope = t.reduce((a, x, i) => a + (x - tm) * (pts[i].value - vm), 0) / sxx;
  return ms => vm + slope * (ms - tm);
}

export const pointsOf = (s: Series, cell: string) =>
  Object.entries(s[cell] ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
