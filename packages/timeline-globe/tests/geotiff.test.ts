import { describe, expect, it } from 'vitest';
import { writeArrayBuffer } from 'geotiff';
import { colorize, readGeoTiff } from '../src/lib/geotiff';

// A small float32 lat/lon GeoTIFF. `tie` is the top-left corner, `scale` the pixel size in degrees.
const tif = (values: number[], width: number, height: number, tie: [number, number], scale: number, extra: object = {}) =>
  writeArrayBuffer(new Float32Array(values), {
    width, height, BitsPerSample: [32], SampleFormat: [3], SamplesPerPixel: 1,
    ModelPixelScale: [scale, scale, 0], ModelTiepoint: [0, 0, 0, tie[0], tie[1], 0],
    GTModelTypeGeoKey: 2, GTRasterTypeGeoKey: 1, GeographicTypeGeoKey: 4326, ...extra,
  });

describe('readGeoTiff', () => {
  it('places a global file on the global grid', async () => {
    // 4x2 pixels of 90 degrees each = the whole globe
    const { grid, width, height } = await readGeoTiff(tif([1, 2, 3, 4, 5, 6, 7, 8], 4, 2, [-180, 90], 90), 8);
    expect([width, height]).toEqual([8, 4]);
    expect(grid[0]).toBe(1);                // top-left
    expect(grid[7]).toBe(4);                // top-right
    expect(grid[3 * 8 + 7]).toBe(8);        // bottom-right
  });

  it('leaves the area outside a regional file empty', async () => {
    // 2x2 pixels of 90 degrees over the north-east quarter
    const { grid } = await readGeoTiff(tif([1, 2, 3, 4], 2, 2, [0, 90], 90), 8);
    expect(grid[0]).toBeNaN();              // north-west is outside
    expect(grid[0 * 8 + 4]).toBe(1);        // north-east starts at column 4
    expect(grid[7]).toBe(2);                // top-right of the file
    expect(grid[1 * 8 + 7]).toBe(4);        // one row down
    expect(grid[3 * 8 + 0]).toBeNaN();      // south-west is outside
  });

  it('treats the file\'s no-data value as empty', async () => {
    const { grid } = await readGeoTiff(tif([1, -9999, 3, 4, 5, 6, 7, 8], 4, 2, [-180, 90], 90, { GDAL_NODATA: '-9999' }), 4);
    expect(grid[1]).toBeNaN();
    expect(grid[0]).toBe(1);
  });

  it('rejects files that are not latitude/longitude, with a way out', async () => {
    const proj = tif([1, 2, 3, 4], 2, 2, [0, 90], 90, { GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: 3857 });
    await expect(readGeoTiff(proj, 8)).rejects.toThrow(/EPSG:4326.*gdalwarp/);
  });

  it('rejects longitudes above 180 (0..360 grids)', async () => {
    await expect(readGeoTiff(tif([1, 2, 3, 4], 2, 2, [0, 90], 180), 8)).rejects.toThrow(/-180..180/);
  });
});

describe('colorize', () => {
  const bins = [{ r: 0, g: 0, b: 255, value: 0 }, { r: 255, g: 255, b: 255, value: 10 }, { r: 255, g: 0, b: 0, value: 20 }];
  it('paints each value with the nearest legend colour and leaves empty cells transparent', () => {
    const px = colorize([0, 4, 6, 20, NaN], bins);
    expect([...px.slice(0, 4)]).toEqual([0, 0, 255, 255]);       // 0 -> blue
    expect([...px.slice(4, 8)]).toEqual([0, 0, 255, 255]);       // 4 is nearer to 0 than to 10
    expect([...px.slice(8, 12)]).toEqual([255, 255, 255, 255]);  // 6 is nearer to 10
    expect([...px.slice(12, 16)]).toEqual([255, 0, 0, 255]);     // 20 -> red
    expect(px[19]).toBe(0);                                      // NaN -> transparent
  });
  it('clamps values beyond the legend to its end colours', () => {
    const px = colorize([-50, 99], bins);
    expect([...px.slice(0, 3)]).toEqual([0, 0, 255]);
    expect([...px.slice(4, 7)]).toEqual([255, 0, 0]);
  });
  it('works when the legend is listed from high to low', () => {
    expect([...colorize([0], [...bins].reverse()).slice(0, 3)]).toEqual([0, 0, 255]);
  });
});
