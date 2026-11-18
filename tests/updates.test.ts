import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INDICATORS } from '@/app/gibs';
import { findNewEnds, hasData, loadState, saveState } from '@/app/updates';

describe('hasData', () => {
  const px = (alphas: number[]) => alphas.flatMap(a => [1, 2, 3, a]);
  it('is false for an empty (fully transparent) image', () => {
    expect(hasData(px(new Array(100).fill(0)))).toBe(false);
  });
  it('is true once a few percent of pixels are opaque', () => {
    expect(hasData(px([...new Array(90).fill(0), ...new Array(10).fill(255)]))).toBe(true);
  });
  it('ignores a stray pixel', () => {
    expect(hasData(px([255, ...new Array(999).fill(0)]))).toBe(false);
  });
});

describe('saved state', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips and starts empty', () => {
    expect(loadState()).toEqual({ ends: {} });
    saveState({ ends: { sst: '2026-05-01' } });
    expect(loadState()).toEqual({ ends: { sst: '2026-05-01' } });
  });
  it('ignores fields from the old weekly-switch version', () => {
    localStorage.setItem('cig.updates', JSON.stringify({ enabled: true, lastCheck: 5, ends: { sst: '2026-05-01' } }));
    expect(loadState()).toEqual({ ends: { sst: '2026-05-01' } });
  });
  it('survives corrupt storage', () => {
    localStorage.setItem('cig.updates', '{not json');
    expect(loadState()).toEqual({ ends: {} });
  });
});

describe('findNewEnds', () => {
  const sst = INDICATORS.find(i => i.id === 'sst')!; // ends 2026-04-01
  it('walks forward month by month while data exists', async () => {
    const has = vi.fn(async (_v: unknown, d: string) => d <= '2026-06-01');
    const found = await findNewEnds([sst], {}, has);
    expect(found).toEqual({ sst: '2026-06-01' });
    expect(has).toHaveBeenCalledWith(sst, '2026-05-01');
  });
  it('continues from a stored end rather than the built-in one', async () => {
    const has = vi.fn(async (_v: unknown, d: string) => d <= '2026-07-01');
    expect(await findNewEnds([sst], { sst: '2026-06-01' }, has)).toEqual({ sst: '2026-07-01' });
  });
  it('reports nothing when there is no newer month', async () => {
    expect(await findNewEnds([sst], {}, async () => false)).toEqual({});
  });
  it('skips records that have ended', async () => {
    const co2 = INDICATORS.find(i => i.id === 'co2')!;
    const has = vi.fn(async () => true);
    expect(await findNewEnds([co2], {}, has)).toEqual({});
    expect(has).not.toHaveBeenCalled();
  });
  it('treats a failed request as no data and stops after a year of catch-up', async () => {
    expect(await findNewEnds([sst], {}, async () => { throw new Error('offline'); })).toEqual({});
    const has = vi.fn(async () => true);
    expect(await findNewEnds([sst], {}, has)).toEqual({ sst: '2027-04-01' });
    expect(has).toHaveBeenCalledTimes(12);
  });
});
