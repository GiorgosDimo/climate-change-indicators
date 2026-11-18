// A catalog is the list of datasets the viewer shows. It can be written in code or loaded from a JSON file
// (see examples/catalog.example.json in the repository).
import type { Indicator, Variant } from './indicators';
import { registerColormap, type Bin } from './frames';

export interface Catalog { title: string; credit: string; indicators: Indicator[] }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const STEPS = 256; // a legend of a few colour stops is smoothed into this many bins so hover values are not coarse

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;
const fail = (where: string, why: string): never => { throw new Error(`${where}: ${why}`); };
const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** Colour stops [{value, color}] smoothed into evenly spaced legend bins. */
export function expandLegend(stops: { value: number; color: string }[]): Bin[] {
  const rgb = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  return Array.from({ length: STEPS }, (_, i) => {
    const f = (i / (STEPS - 1)) * (stops.length - 1), k = Math.min(Math.floor(f), stops.length - 2), t = f - k;
    const [a, b] = [stops[k], stops[k + 1]], cb = rgb(b.color);
    const [r, g, bl] = rgb(a.color).map((x, j) => Math.round(x + (cb[j] - x) * t));
    return { r, g, b: bl, value: a.value + (b.value - a.value) * t };
  });
}

// Trust boundary: the JSON comes from a URL, so every field the app relies on is checked here.
function variant(raw: Raw, where: string): Variant {
  const layer = text(raw.layer), template = text(raw.template), wms = text(raw.wms);
  if (!layer && !template) fail(where, 'needs "layer" (a WMS layer) or "template" (an image URL containing {date})');
  if (template && !template.includes('{date}')) fail(where, '"template" must contain {date}');
  if (raw.format !== undefined && raw.format !== 'geotiff') fail(where, '"format" can only be "geotiff"');
  if (raw.format === 'geotiff' && !template) fail(where, 'format "geotiff" needs a "template" (URL of the .tif with {date})');
  for (const u of [wms, template]) if (u && !/^(https?:\/\/|\/(?!\/))/.test(u)) fail(where, 'URLs must start with http://, https:// or / (a path on this site)');
  const { start, end } = raw;
  if (!ISO.test(start ?? '') || !ISO.test(end ?? '') || start >= end) fail(where, '"start" and "end" must be YYYY-MM-DD dates, start before end');

  let colormap = text(raw.colormap);
  if (raw.legend) {
    const st = raw.legend.stops;
    if (!Array.isArray(st) || st.length < 2 || !st.every(s => Number.isFinite(s?.value) && HEX.test(s?.color ?? ''))) {
      fail(where, '"legend.stops" needs at least 2 items like {"value": 0, "color": "#0000ff"}');
    }
    colormap = `inline:${where}`;
    registerColormap(colormap, { units: text(raw.legend.units), bins: expandLegend(st) });
  }
  if (!colormap) fail(where, 'needs a "legend" ({stops}) or a "colormap" (GIBS colormap name or URL of its XML)');

  return {
    layer: layer || template, colormap, start, end, wms: wms || undefined, template: template || undefined, geotiff: raw.format === 'geotiff' || undefined,
    everyDays: typeof raw.everyDays === 'number' ? raw.everyDays : undefined,
    unit: text(raw.unit) || undefined, scale: typeof raw.scale === 'number' ? raw.scale : undefined,
  };
}

export function parseCatalog(json: unknown): Catalog {
  const raw = json as Raw;
  if (!raw || !text(raw.title) || !Array.isArray(raw.indicators) || !raw.indicators.length) {
    fail('catalog', 'needs a "title" and a non-empty "indicators" list');
  }
  const ids = new Set<string>();
  const indicators = (raw.indicators as Raw[]).map((r, i): Indicator => {
    const where = `indicators[${i}]`;
    if (!text(r?.id) || !text(r.name)) fail(where, 'needs "id" and "name"');
    if (ids.has(r.id)) fail(where, `duplicate id "${r.id}"`);
    ids.add(r.id);
    return {
      ...variant(r, where), id: r.id, name: r.name,
      res: typeof r.res === 'number' ? r.res : 1440, alpha: typeof r.alpha === 'number' ? r.alpha : 0.9, north: !!r.north,
      weekly: r.weekly ? variant(r.weekly, `${where}.weekly`) : undefined,
      about: text(r.about), howto: text(r.howto), note: text(r.note),
    };
  });
  return { title: raw.title, credit: text(raw.credit), indicators };
}

export async function loadCatalog(url: string): Promise<Catalog> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return parseCatalog(await r.json());
}
