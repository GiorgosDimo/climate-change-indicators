import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, expandLegend, parseCatalog } from '@/lib/catalog';
import { loadColormap } from '@/lib/frames';
import { frameUrl, hasDetail } from '@/lib/indicators';
import example from '../examples/catalog.example.json';

const ind = (over: object = {}) => ({ id: 'a', name: 'A', layer: 'L', colormap: 'CM', start: '2000-01-01', end: '2001-01-01', ...over });
const cat = (...i: object[]) => ({ title: 'T', indicators: i });

describe('default catalog', () => {
  it('is the ten GIBS indicators', () => {
    expect(DEFAULT_CATALOG.indicators).toHaveLength(10);
    expect(DEFAULT_CATALOG.credit).toMatch(/GIBS/);
  });
});

describe('parseCatalog', () => {
  it('accepts the documented example', () => {
    const c = parseCatalog(example);
    expect(c.title).toBe('My Spatial Data');
    expect(c.indicators.map(i => i.id)).toEqual(['temp-wms', 'images', 'geotiff']);
    expect(c.indicators[2].geotiff).toBe(true);
  });

  it('fills defaults and keeps the optional fields it knows', () => {
    const [a] = parseCatalog(cat(ind({ everyDays: 5, unit: 'mm', scale: 2, weekly: ind() }))).indicators;
    expect(a).toMatchObject({ res: 1440, alpha: 0.9, north: false, about: '', everyDays: 5, unit: 'mm', scale: 2 });
    expect(a.weekly?.layer).toBe('L');
  });

  it.each([
    ['not an object', null, /title/],
    ['no indicators', { title: 'T', indicators: [] }, /non-empty/],
    ['no id', cat(ind({ id: '' })), /indicators\[0\].*id/],
    ['duplicate ids', cat(ind(), ind()), /duplicate id "a"/],
    ['neither layer nor template', cat(ind({ layer: undefined })), /layer.*template/],
    ['template without {date}', cat(ind({ template: 'https://x.org/a.png' })), /\{date\}/],
    ['non-http url', cat(ind({ wms: 'javascript:alert(1)' })), /http/],
    ['protocol-relative url', cat(ind({ wms: '//evil.org/wms' })), /http/],
    ['bad dates', cat(ind({ start: '2000-1-1' })), /YYYY-MM-DD/],
    ['end before start', cat(ind({ start: '2002-01-01' })), /start before end/],
    ['no legend or colormap', cat(ind({ colormap: undefined })), /legend.*colormap/],
    ['one-stop legend', cat(ind({ legend: { stops: [{ value: 1, color: '#000000' }] } })), /at least 2/],
    ['bad stop colour', cat(ind({ legend: { stops: [{ value: 1, color: 'red' }, { value: 2, color: '#000000' }] } })), /at least 2/],
    ['unknown format', cat(ind({ template: 'https://h.org/{date}.png', format: 'png' })), /format/],
    ['geotiff without a template', cat(ind({ format: 'geotiff' })), /needs a "template"/],
    ['bad weekly', cat(ind({ weekly: { layer: 'W' } })), /weekly/],
  ])('rejects %s with a message that says where', (_n, json, msg) => {
    expect(() => parseCatalog(json)).toThrow(msg);
  });

  it('accepts a path on the same site', () => {
    expect(parseCatalog(cat(ind({ template: '/frames/{date}.png' }))).indicators[0].template).toBe('/frames/{date}.png');
  });

  it('registers an inline legend so the colour picker can use it', async () => {
    const [a] = parseCatalog(cat(ind({ colormap: undefined, legend: { units: '°C', stops: [{ value: 0, color: '#000000' }, { value: 10, color: '#ffffff' }] } }))).indicators;
    expect(a.colormap).toBe('inline:indicators[0]');
    const cm = await loadColormap(a.colormap);
    expect(cm.units).toBe('°C');
    expect(cm.bins[0]).toMatchObject({ r: 0, value: 0 });
    expect(cm.bins.at(-1)).toMatchObject({ r: 255, value: 10 });
  });
});

describe('expandLegend', () => {
  it('interpolates colours and values between stops', () => {
    const bins = expandLegend([{ value: 0, color: '#000000' }, { value: 100, color: '#ff0000' }, { value: 200, color: '#ff0000' }]);
    expect(bins).toHaveLength(256);
    expect(bins[0]).toMatchObject({ r: 0, value: 0 });
    expect(bins.at(-1)).toMatchObject({ r: 255, value: 200 });
    expect(bins.map(b => b.value)).toEqual([...bins.map(b => b.value)].sort((x, y) => x - y)); // monotonic
  });
});

describe('frame sources', () => {
  it('a GeoTIFF source adds the legend and width as a fragment, and has no zoom detail', () => {
    const v = { layer: 'x', template: 'https://h.org/{date}.tif', geotiff: true, colormap: 'inline:indicators[0]' };
    expect(frameUrl(v, '2020-03-01', 1440)).toBe('https://h.org/2020-03-01.tif#tif=inline%3Aindicators%5B0%5D&w=1440');
    expect(hasDetail(v)).toBe(false);
  });
  it('the catalog accepts format geotiff', () => {
    const [a] = parseCatalog(cat(ind({ layer: undefined, template: 'https://h.org/{date}.tif', format: 'geotiff' }))).indicators;
    expect(a.geotiff).toBe(true);
  });
  it('a WMS source uses its own endpoint and keeps an existing query string', () => {
    expect(frameUrl({ layer: 'L', wms: 'https://h.org/wms' }, '2020-03-01', 720)).toMatch(/^https:\/\/h\.org\/wms\?SERVICE=WMS/);
    expect(frameUrl({ layer: 'L', wms: 'https://h.org/wms?map=x' }, '2020-03-01', 720)).toMatch(/^https:\/\/h\.org\/wms\?map=x&SERVICE=WMS/);
    expect(frameUrl({ layer: 'L' }, '2020-03-01', 720)).toContain('gibs.earthdata.nasa.gov');
  });
  it('an image template gets the date (and size / box when it asks for them)', () => {
    const v = { layer: 'x', template: 'https://h.org/{date}/{width}x{height}.png?b={bbox}' };
    expect(frameUrl(v, '2020-03-01', 400, [0, 0, 40, 20])).toBe('https://h.org/2020-03-01/400x200.png?b=0,0,40,20');
  });
  it('zoom detail needs a WMS or a template that takes a box', () => {
    expect(hasDetail({ layer: 'L' })).toBe(true);
    expect(hasDetail({ layer: 'x', template: 'https://h.org/{date}.png' })).toBe(false);
    expect(hasDetail({ layer: 'x', template: 'https://h.org/{date}.png?b={bbox}' })).toBe(true);
  });
});
