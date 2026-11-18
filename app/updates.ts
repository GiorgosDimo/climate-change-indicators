// Checks for newer data every time the app opens (a web page cannot run in the background).
import { addMonth, frameUrl, type Indicator, type Variant } from 'timeline-globe';

const KEY = 'cig.updates';

export interface UpdateState { ends: Record<string, string> } // newest month found per indicator
const EMPTY: UpdateState = { ends: {} };

export function loadState(): UpdateState {
  try { return { ends: JSON.parse(localStorage.getItem(KEY) ?? '{}').ends ?? {} }; } catch { return EMPTY; }
}
export function saveState(s: UpdateState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: setting just won't persist */ }
}

/** GIBS answers a date with no data with an empty image, so "mostly transparent" means no data. */
export function hasData(rgba: ArrayLike<number>): boolean {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0) n++;
  return n / (rgba.length / 4) > 0.02;
}

async function probe(v: Variant, date: string): Promise<boolean> {
  const r = await fetch(frameUrl(v, date, 180));
  const blob = await r.blob();
  if (!r.ok || !blob.type.startsWith('image/')) return false;
  const bmp = await createImageBitmap(blob);
  const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  return hasData(ctx.getImageData(0, 0, bmp.width, bmp.height).data);
}

const MAX_MONTHS = 12; // shortcut: stops after a year of catch-up, the next load continues from there

/** New last month for every ongoing indicator that has published more data since `ends`. */
export async function findNewEnds(
  inds: Indicator[], ends: Record<string, string>, has: (v: Variant, date: string) => Promise<boolean> = probe,
): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  await Promise.all(inds.filter(i => i.ongoing).map(async i => {
    let end = ends[i.id] ?? i.end;
    for (let n = 0; n < MAX_MONTHS; n++) {
      const next = addMonth(end);
      if (!(await has(i, next).catch(() => false))) break;
      end = next;
    }
    if (end !== (ends[i.id] ?? i.end)) found[i.id] = end;
  }));
  return found;
}
