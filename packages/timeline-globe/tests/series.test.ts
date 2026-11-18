import { describe, expect, it } from 'vitest';
import { addPoint, linearFit, pointsOf } from '../src/lib/series';

describe('series', () => {
  it('keeps one value per frame date and sorts by date', () => {
    let s = addPoint({}, 'c', '2020-03-01', 3);
    s = addPoint(s, 'c', '2020-01-01', 1);
    s = addPoint(s, 'c', '2020-03-01', 4); // revisiting a frame replaces it
    expect(pointsOf(s, 'c')).toEqual([{ date: '2020-01-01', value: 1 }, { date: '2020-03-01', value: 4 }]);
  });
  it('keeps cells apart and returns nothing for an unknown cell', () => {
    const s = addPoint(addPoint({}, 'a', '2020-01-01', 1), 'b', '2020-01-01', 2);
    expect(pointsOf(s, 'a')).toHaveLength(1);
    expect(pointsOf(s, 'z')).toEqual([]);
  });
  it('returns the same object when nothing changed', () => {
    const s = addPoint({}, 'a', '2020-01-01', 1);
    expect(addPoint(s, 'a', '2020-01-01', 1)).toBe(s);
  });

  describe('linearFit', () => {
    const p = (date: string, value: number) => ({ date, value });
    it('fits a rising line', () => {
      const f = linearFit([p('2000-01-01', 1), p('2001-01-01', 2), p('2002-01-01', 3)])!;
      expect(f(Date.parse('2001-01-01'))).toBeCloseTo(2, 1);
      expect(f(Date.parse('2002-01-01'))).toBeGreaterThan(f(Date.parse('2000-01-01')));
    });
    it('has no line for fewer than two points or a single date', () => {
      expect(linearFit([p('2000-01-01', 1)])).toBeNull();
      expect(linearFit([p('2000-01-01', 1), p('2000-01-01', 2)])).toBeNull();
    });
  });
});
