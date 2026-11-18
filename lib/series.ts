// Values seen at one map cell over time: cell key -> frame date -> value.
export type Series = Record<string, Record<string, number>>;
export const MIN_POINTS = 5; // fewer points do not make a useful line

/** Keyed by date, so scrubbing back or looping replaces a point instead of duplicating it. */
export function addPoint(s: Series, cell: string, date: string, value: number): Series {
  return s[cell]?.[date] === value ? s : { ...s, [cell]: { ...s[cell], [date]: value } };
}

export const pointsOf = (s: Series, cell: string) =>
  Object.entries(s[cell] ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
