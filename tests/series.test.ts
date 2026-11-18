import { describe, expect, it } from 'vitest';
import { addPoint, pointsOf } from '@/lib/series';

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
});
