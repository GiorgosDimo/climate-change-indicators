import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, INDICATORS, withEnds } from '@/app/gibs';
import { addMonth, fmtDate, fmtFor, frameUrl, framesFor, monthList, variantFor } from '../packages/timeline-globe/src/lib/indicators';

const get = (id: string) => INDICATORS.find(i => i.id === id)!;

describe('dates', () => {
  it('lists every 1st of the month, inclusive', () => {
    expect(monthList('2020-11-15', '2021-02-01')).toEqual(['2020-11-01', '2020-12-01', '2021-01-01', '2021-02-01']);
  });
  it('rolls December into January', () => {
    expect(addMonth('2020-12-01')).toBe('2021-01-01');
  });
  it('formats dd/mm/yyyy', () => {
    expect(fmtDate('2026-11-05')).toBe('05/11/2026');
  });
  it('shows the full date only for weekly, "Mon YYYY" for monthly and "YYYY" for yearly', () => {
    expect(fmtFor('2026-11-05', 'week')).toBe('05/11/2026');
    expect(fmtFor('2026-11-01', 'month')).toBe('Nov 2026');
    expect(fmtFor('1980-01-01', 'month')).toBe('Jan 1980');
    expect(fmtFor('2026-11-01', 'year')).toBe('2026');
  });
});

describe('framesFor', () => {
  const months = monthList('2020-01-01', '2022-12-01');
  it('monthly returns one frame per month', () => {
    expect(framesFor(get('ndvi'), months, 'month')).toHaveLength(36);
  });
  it('yearly returns the same calendar month each year', () => {
    expect(framesFor(get('ndvi'), months, 'year')).toEqual(['2020-01-01', '2021-01-01', '2022-01-01']);
  });
  it('weekly steps 7 days through the chosen months', () => {
    const f = framesFor(get('sst'), monthList('2020-03-01', '2020-03-01'), 'week');
    expect(f).toEqual(['2020-03-01', '2020-03-08', '2020-03-15', '2020-03-22', '2020-03-29']);
  });
  it('weekly is clipped to the daily layer\'s own range', () => {
    const f = framesFor(get('sst'), monthList('2002-05-01', '2002-06-30'), 'week');
    expect(f[0]).toBe('2002-06-01'); // daily layer starts 2002-06-01
  });
  it('a 5-day product is sampled on its own cadence, not on the 1st (GIBS returns blanks otherwise)', () => {
    const sl = get('sea-level');
    const f = framesFor(sl, monthList('2000-01-01', '2000-06-01'), 'month');
    const anchor = Date.parse(sl.start + 'T00:00:00Z');
    for (const d of f) expect(((Date.parse(d + 'T00:00:00Z') - anchor) / 86_400_000) % 5).toBe(0);
    expect(f).toHaveLength(6);
  });
  it('drops frames after the layer ends', () => {
    expect(framesFor(get('co2'), monthList('2011-01-01', '2013-01-01'), 'month').at(-1)).toBe('2012-02-01');
  });
  it('is empty for an empty period', () => {
    expect(framesFor(get('sst'), [], 'month')).toEqual([]);
  });
});

describe('frameUrl', () => {
  it('builds a global WMS request', () => {
    const u = frameUrl({ layer: 'LAYER_X' }, '2020-03-01', 720);
    expect(u).toContain('LAYERS=LAYER_X');
    expect(u).toContain('TIME=2020-03-01');
    expect(u).toContain('BBOX=-180,-90,180,90');
    expect(u).toContain('WIDTH=720&HEIGHT=360');
  });
  it('keeps a regional box\'s aspect ratio when no height is given', () => {
    expect(frameUrl({ layer: 'L' }, '2020-01-01', 400, [0, 0, 40, 20])).toContain('WIDTH=400&HEIGHT=200');
  });
});

describe('indicator catalog', () => {
  it('has ten unique indicators', () => {
    expect(INDICATORS).toHaveLength(10);
    expect(new Set(INDICATORS.map(i => i.id)).size).toBe(10);
  });
  it.each(INDICATORS)('$id is well formed', ind => {
    expect(ind.start < ind.end).toBe(true);
    expect(monthList(ind.start, ind.end).length).toBeGreaterThanOrEqual(60); // at least 5 years
    expect(ind.about.length).toBeGreaterThan(50);
    expect(ind.howto.length).toBeGreaterThan(50);
    expect(ind.alpha).toBeGreaterThan(0);
    if (ind.weekly) expect(ind.weekly.start < ind.weekly.end).toBe(true);
  });
  it('uses the weekly variant only in weekly mode', () => {
    const sst = get('sst');
    expect(variantFor(sst, 'week').layer).toBe(sst.weekly!.layer);
    expect(variantFor(sst, 'month').layer).toBe(sst.layer);
    expect(variantFor(get('co2'), 'week')).toBe(get('co2')); // no weekly product → falls back
  });
});

describe('built-in catalog', () => {
  it('is the ten GIBS indicators with a title and credit', () => {
    expect(DEFAULT_CATALOG.indicators).toBe(INDICATORS);
    expect(DEFAULT_CATALOG.credit).toMatch(/GIBS/);
  });
  it('withEnds moves an indicator\'s last month forward and keeps the others as they are', () => {
    const c = withEnds(DEFAULT_CATALOG, { sst: '2026-09-01' });
    const sst = c.indicators.find(i => i.id === 'sst')!;
    expect(sst.end).toBe('2026-09-01');
    expect(sst.weekly!.end >= '2026-09-01').toBe(true);
    expect(c.indicators.find(i => i.id === 'ndvi')).toBe(INDICATORS.find(i => i.id === 'ndvi'));
  });
  it('is unchanged when nothing new was found', () => {
    expect(withEnds(DEFAULT_CATALOG, {}).indicators).toEqual(INDICATORS);
  });
});

