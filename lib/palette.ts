// Re-colouring: GIBS draws each layer with its own fixed colours. Because every pixel's colour maps
// back to a legend bin (see decode), we can repaint the layer with any palette on the client.
import { nearestBin, type Colormap } from './frames';

export type PaletteId = 'original' | 'viridis' | 'blueRed' | 'gray' | 'custom';
export interface Palette { id: PaletteId; low: string; high: string } // low/high only used by 'custom'

export const ORIGINAL: Palette = { id: 'original', low: '#2c7bb6', high: '#d7191c' };
export const PALETTES: { id: PaletteId; label: string }[] = [
  { id: 'original', label: 'Original (NASA)' },
  { id: 'viridis', label: 'Viridis' },
  { id: 'blueRed', label: 'Blue to red' },
  { id: 'gray', label: 'Grayscale' },
  { id: 'custom', label: 'Custom…' },
];

const STOPS: Partial<Record<PaletteId, string[]>> = {
  viridis: ['#440154', '#3b528b', '#21908d', '#5dc863', '#fde725'],
  blueRed: ['#313695', '#74add1', '#ffffbf', '#f46d43', '#a50026'],
  gray: ['#000000', '#ffffff'],
};
const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

export type RGB = [number, number, number];

/** Colour at position t (0..1) along a non-original palette. */
export function colorAt(p: Palette, t: number): RGB {
  const stops = (p.id === 'custom' ? [p.low, p.high] : STOPS[p.id] ?? [p.low, p.high]).map(hex);
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  return [0, 1, 2].map(k => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f)) as RGB;
}

/** CSS colours for a legend bar: the layer's own colours, or the chosen palette. */
export function legendStops(cm: Colormap, p: Palette, n = 16): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const [r, g, b] = p.id === 'original' && cm.bins.length
      ? (({ r, g, b }) => [r, g, b])(cm.bins[Math.round(t * (cm.bins.length - 1))])
      : colorAt(p, t);
    out.push(`rgb(${r},${g},${b})`);
  }
  return out;
}

/** Repaints RGBA pixels in place: each legend colour becomes its position along the palette. */
export function recolorPixels(data: Uint8ClampedArray, cm: Colormap, p: Palette): void {
  const n = cm.bins.length;
  if (p.id === 'original' || n < 2) return;
  const cache = new Map<number, number>(); // distinct colours are few, so match each only once
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let v = cache.get(key);
    if (v === undefined) {
      const idx = nearestBin(cm, data[i], data[i + 1], data[i + 2]);
      const c = idx < 0 ? null : colorAt(p, idx / (n - 1));
      v = c ? (c[0] << 16) | (c[1] << 8) | c[2] : -1; // -1: not a legend colour, leave as is
      cache.set(key, v);
    }
    if (v >= 0) { data[i] = v >> 16; data[i + 1] = (v >> 8) & 255; data[i + 2] = v & 255; }
  }
}

export async function recolorBitmap(b: ImageBitmap, cm: Colormap, p: Palette): Promise<Blob> {
  const c = new OffscreenCanvas(b.width, b.height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(b, 0, 0);
  const img = ctx.getImageData(0, 0, b.width, b.height);
  recolorPixels(img.data, cm, p);
  ctx.putImageData(img, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}
