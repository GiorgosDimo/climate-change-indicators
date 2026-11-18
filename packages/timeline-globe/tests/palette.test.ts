import { describe, expect, it } from 'vitest';
import type { Colormap } from '../src/lib/frames';
import { ORIGINAL, colorAt, legendStops, recolorPixels } from '../src/lib/palette';

const cm: Colormap = {
  units: 'x',
  bins: [
    { r: 255, g: 0, b: 0, value: 0 },
    { r: 0, g: 255, b: 0, value: 5 },
    { r: 0, g: 0, b: 255, value: 10 },
  ],
};
const gray = { ...ORIGINAL, id: 'gray' as const };
const custom = { id: 'custom' as const, low: '#000000', high: '#ff0000' };

describe('colorAt', () => {
  it('hits the ends and interpolates between stops', () => {
    expect(colorAt(gray, 0)).toEqual([0, 0, 0]);
    expect(colorAt(gray, 1)).toEqual([255, 255, 255]);
    expect(colorAt(gray, 0.5)).toEqual([128, 128, 128]);
  });
  it('clamps out-of-range positions', () => {
    expect(colorAt(gray, 5)).toEqual([255, 255, 255]);
    expect(colorAt(gray, -1)).toEqual([0, 0, 0]);
  });
  it('blends the two chosen colours for a custom palette', () => {
    expect(colorAt(custom, 0.5)).toEqual([128, 0, 0]);
  });
});

describe('legendStops', () => {
  it("uses the layer's own colours for the original palette", () => {
    const s = legendStops(cm, ORIGINAL, 3);
    expect(s).toEqual(['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)']);
  });
  it('follows the chosen palette otherwise', () => {
    const s = legendStops(cm, gray, 2);
    expect(s).toEqual(['rgb(0,0,0)', 'rgb(255,255,255)']);
  });
});

describe('recolorPixels', () => {
  // red, green, blue, a transparent pixel, an off-legend pixel
  const px = () => new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 0, 0, 0, 120, 120, 120, 255]);
  it('repaints each legend colour by its position along the palette', () => {
    const d = px();
    recolorPixels(d, cm, gray);
    expect([...d.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...d.slice(4, 8)]).toEqual([128, 128, 128, 255]);
    expect([...d.slice(8, 12)]).toEqual([255, 255, 255, 255]);
  });
  it('leaves transparent and non-legend pixels alone', () => {
    const d = px();
    recolorPixels(d, cm, gray);
    expect([...d.slice(12, 16)]).toEqual([255, 0, 0, 0]);
    expect([...d.slice(16, 20)]).toEqual([120, 120, 120, 255]);
  });
  it('does nothing for the original palette', () => {
    const d = px();
    recolorPixels(d, cm, ORIGINAL);
    expect([...d]).toEqual([...px()]);
  });
});
