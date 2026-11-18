// Frame images and colormaps, fetched once and shared by the globe, playback and value picker.

interface Frame { url: string; blob: Blob }
const frames = new Map<string, Promise<Frame>>();
const MAX = 40;
const REVOKE_AFTER = 30_000; // a revoked blob URL can't be fetched, so never revoke one that may still be loading

export function loadFrame(src: string): Promise<Frame> {
  let p = frames.get(src);
  if (p) { frames.delete(src); frames.set(src, p); return p; } // re-insert: most recently used goes last
  if (!p) {
    p = fetch(src).then(async r => {
      const blob = await r.blob();
      if (!r.ok || !blob.type.startsWith('image/')) throw new Error(`no frame (${r.status})`);
      return { url: URL.createObjectURL(blob), blob };
    });
    p.catch(() => frames.delete(src)); // allow retry
    frames.set(src, p);
    if (frames.size > MAX) {
      const [old] = frames.keys(); // least recently used
      frames.get(old)?.then(f => setTimeout(() => URL.revokeObjectURL(f.url), REVOKE_AFTER)).catch(() => {});
      frames.delete(old);
    }
  }
  return p;
}

export interface Bin { r: number; g: number; b: number; value: number }
export interface Colormap { units: string; bins: Bin[] }
const maps = new Map<string, Promise<Colormap>>();

export function parseColormap(xml: string): Colormap {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  // The data legend is the ColorMap with the most entries (the other one is "No Data").
  const cm = [...doc.querySelectorAll('ColorMap')]
    .sort((a, b) => b.querySelectorAll('ColorMapEntry').length - a.querySelectorAll('ColorMapEntry').length)[0];
  const bins: Bin[] = [];
  if (!cm) return { units: '', bins };
  for (const e of cm.querySelectorAll('ColorMapEntry')) {
    // `value` is already in display units (e.g. ppbv, NDVI); `sourceValue` is the raw encoding.
    const sv = e.getAttribute('value') ?? e.getAttribute('sourceValue');
    if (!sv || e.getAttribute('transparent') === 'true') continue;
    const nums = sv.replace(/[[\]()]/g, '').split(',').map(Number).filter(Number.isFinite);
    if (!nums.length) continue;
    const [r, g, b] = e.getAttribute('rgb')!.split(',').map(Number);
    bins.push({ r, g, b, value: nums.reduce((a, c) => a + c, 0) / nums.length });
  }
  return { units: cm.getAttribute('units') ?? '', bins };
}

/** Make a legend available under a name (used for legends written inline in a catalog). */
export const registerColormap = (name: string, cm: Colormap) => { maps.set(name, Promise.resolve(cm)); };

/** `name` is a GIBS colormap name, or the URL of a GIBS-format colormap XML. */
export function loadColormap(name: string): Promise<Colormap> {
  let p = maps.get(name);
  if (!p) {
    p = fetch(/^https?:\/\//.test(name) ? name : `https://gibs.earthdata.nasa.gov/colormaps/v1.3/${name}.xml`)
      .then(r => { if (!r.ok) throw new Error(`colormap ${name}: ${r.status}`); return r.text(); })
      .then(parseColormap);
    p.catch(() => maps.delete(name));
    maps.set(name, p);
  }
  return p;
}

/** Index of the nearest legend colour; -1 when nothing is close (resampled or border pixel). */
export function nearestBin(cm: Colormap, r: number, g: number, b: number): number {
  let best = -1, bd = 900; // squared RGB distance, ~30 per channel
  cm.bins.forEach((c, i) => {
    const d = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

/** Legend value of the nearest colour, or null. */
export function decode(cm: Colormap, r: number, g: number, b: number): number | null {
  const i = nearestBin(cm, r, g, b);
  return i < 0 ? null : cm.bins[i].value;
}
