// Dates, frame schedules and frame URLs for any catalog. The built-in GIBS data lives in the app (app/gibs.ts).
// GIBS does not snap dates: a date with no data returns a blank image, so frames must be
// requested on each layer's real cadence (everyDays) and gaps simply play as blank frames.

export type Mode = 'week' | 'month' | 'year';

export interface Variant {
  layer: string;       // WMS layer name (for an image template: just a unique name)
  wms?: string;        // WMS endpoint; GIBS when omitted
  template?: string;   // instead of WMS: image URL with {date} (and optionally {width} {height} {bbox})
  geotiff?: boolean;   // the template's files are GeoTIFFs, painted with the legend in the browser
  colormap: string;    // legend used to turn pixel colour back into a value: GIBS colormap name, URL of its XML, or a registered inline legend
  start: string;       // first date available
  end: string;         // last date available
  everyDays?: number;  // native cadence when it is not daily/monthly (anchor = start)
  unit?: string;       // shown when the colormap has none (or, with scale, instead of it)
  scale?: number;      // multiply legend values for display, e.g. mm/hr → mm/day
}

export interface Indicator extends Variant {
  id: string;
  name: string;
  res: number;         // image width in px (height = res / 2); finer where the data is finer
  alpha: number;       // overlay opacity; lower for atmospheric layers so the map shows through
  north?: boolean;     // tilt the globe to the north pole when selected
  ongoing?: boolean;   // still being produced, so the weekly update check applies
  weekly?: Variant;    // a daily layer sampled every 7 days (everyDays overrides the 7)
  about: string;
  howto: string;
  note: string;
}

const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');

export const variantFor = (ind: Indicator, mode: Mode): Variant =>
  mode === 'week' && ind.weekly ? ind.weekly : ind;

export function addMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
}

/** Every 1st-of-month between two ISO dates (inclusive). */
export function monthList(start: string, end: string): string[] {
  const out: string[] = [];
  const stop = end.slice(0, 7);
  for (let d = start.slice(0, 7) + '-01'; d.slice(0, 7) <= stop; d = addMonth(d)) out.push(d);
  return out;
}

const endOfMonth = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return toIso(Date.UTC(y, m, 0));
};

/** First date on a layer's own cadence that is on or after `d`. */
function snap(v: Variant, d: string): string {
  if (!v.everyDays) return d;
  const step = v.everyDays * DAY, a = utc(v.start);
  return toIso(a + Math.max(0, Math.ceil((utc(d) - a) / step)) * step);
}

/** Frame dates for the chosen months. Weekly walks day by day through them. */
export function framesFor(ind: Indicator, months: string[], mode: Mode): string[] {
  if (!months.length) return [];
  const v = variantFor(ind, mode);
  if (mode === 'week') {
    const step = (v.everyDays ?? 7) * DAY;
    const lo = Math.max(utc(months[0]), utc(v.start)), hi = Math.min(utc(endOfMonth(months[months.length - 1])), utc(v.end));
    const first = v.everyDays ? utc(snap(v, toIso(lo))) : lo;
    const out: string[] = [];
    for (let t = first; t <= hi; t += step) out.push(toIso(t));
    return out;
  }
  const base = mode === 'year' ? months.filter((_, i) => i % 12 === 0) : months;
  return base.map(d => snap(v, d)).filter(d => d <= v.end);
}

export type BBox = [west: number, south: number, east: number, north: number];

export const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
type Source = Pick<Variant, 'layer' | 'wms' | 'template' | 'geotiff'> & { colormap?: string };

/** A fixed image template always shows the whole globe, so it cannot supply a sharper image of the zoomed-in area. */
export const hasDetail = (v: Source) => !v.geotiff && (!v.template || v.template.includes('{bbox}'));

/** Image URL for one frame: a WMS GetMap (EPSG:4326, TIME=date) or the image template filled in. */
export const frameUrl = (v: Source, date: string, width: number, bbox: BBox = [-180, -90, 180, 90], height?: number) => {
  const h = height ?? Math.round((width * (bbox[3] - bbox[1])) / (bbox[2] - bbox[0]));
  if (v.template) {
    const url = v.template.replace(/\{date\}/g, date).replace(/\{width\}/g, String(width)).replace(/\{height\}/g, String(h))
      .replace(/\{bbox\}/g, bbox.join(','));
    // The fragment is never sent to the server; it tells loadFrame to paint the file with this legend at this width.
    return v.geotiff ? `${url}#tif=${encodeURIComponent(v.colormap ?? '')}&w=${width}` : url;
  }
  const base = v.wms ?? GIBS_WMS;
  return `${base}${base.includes('?') ? '&' : '?'}SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1` +
    `&SRS=EPSG:4326&BBOX=${bbox.join(',')}&WIDTH=${width}&HEIGHT=${h}&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=` +
    `&LAYERS=${v.layer}&TIME=${date}`;
};

export const fmtDate = (iso: string) => iso.split('-').reverse().join('/'); // dd/mm/yyyy

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Weekly frames show the full date, monthly "Mar 2020", yearly "2020". */
export const fmtFor = (iso: string, mode: Mode) =>
  mode === 'week' ? fmtDate(iso) : mode === 'year' ? iso.slice(0, 4) : `${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
