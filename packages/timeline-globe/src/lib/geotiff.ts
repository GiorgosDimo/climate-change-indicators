// GeoTIFF frames: the file is read in the browser, resampled onto a whole-globe grid and painted with the
// layer's legend, which turns it into the same kind of coloured image as every other source.
import type { Bin, Colormap } from './frames';

const EDGE = 1e-6; // tolerance when checking the extent

/** First band of a lat/lon GeoTIFF, resampled onto a `width` x `width/2` global grid. NaN = no data / outside the file. */
export async function readGeoTiff(buf: ArrayBuffer, width: number): Promise<{ grid: Float32Array; width: number; height: number }> {
  const { fromArrayBuffer } = await import('geotiff'); // loaded only when a GeoTIFF is first used
  const image = await (await fromArrayBuffer(buf)).getImage();
  const keys = image.getGeoKeys();
  if (!keys || keys.ProjectedCSTypeGeoKey || (keys.GTModelTypeGeoKey && keys.GTModelTypeGeoKey !== 2)) {
    throw new Error('GeoTIFF must use latitude/longitude (EPSG:4326); reproject it with gdalwarp -t_srs EPSG:4326');
  }
  const [west, south, east, north] = image.getBoundingBox();
  if (west < -180 - EDGE || east > 180 + EDGE || south < -90 - EDGE || north > 90 + EDGE) {
    throw new Error('GeoTIFF longitudes must be within -180..180 and latitudes within -90..90');
  }
  const height = Math.round(width / 2);
  // where the file's extent lands on the global grid
  const x0 = Math.round(((west + 180) / 360) * width), x1 = Math.round(((east + 180) / 360) * width);
  const y0 = Math.round(((90 - north) / 180) * height), y1 = Math.round(((90 - south) / 180) * height);
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  // shortcut: the whole file is decoded before resampling, so very large rasters (tens of thousands of pixels wide) are slow
  const [band] = await image.readRasters({ samples: [0], width: w, height: h, resampleMethod: 'nearest', interleave: false });
  const nodata = image.getGDALNoData();
  const grid = new Float32Array(width * height).fill(NaN);
  for (let y = 0; y < h && y0 + y < height; y++) {
    for (let x = 0; x < w && x0 + x < width; x++) {
      const v = band[y * w + x];
      if (v !== nodata && Number.isFinite(v)) grid[(y0 + y) * width + x0 + x] = v;
    }
  }
  return { grid, width, height };
}

/** RGBA pixels: each value gets the colour of the nearest legend bin (values outside the legend take its end colours). */
export function colorize(grid: ArrayLike<number>, bins: Bin[]): Uint8ClampedArray<ArrayBuffer> {
  const sorted = [...bins].sort((a, b) => a.value - b.value);
  const out = new Uint8ClampedArray(grid.length * 4);
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (Number.isNaN(v)) continue; // stays transparent
    let lo = 0, hi = sorted.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid].value < v) lo = mid + 1; else hi = mid; }
    const b = lo > 0 && v - sorted[lo - 1].value < sorted[lo].value - v ? sorted[lo - 1] : sorted[lo];
    out.set([b.r, b.g, b.b, 255], i * 4);
  }
  return out;
}

export async function geotiffToPng(buf: ArrayBuffer, cm: Colormap, width: number): Promise<Blob> {
  const { grid, height } = await readGeoTiff(buf, width);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.putImageData(new ImageData(colorize(grid, cm.bins), width, height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}
