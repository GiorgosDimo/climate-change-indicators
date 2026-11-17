import { describe, expect, it } from 'vitest';
import { fmtNum, formatValue } from '@/lib/format';

describe('formatValue', () => {
  it('shows kelvin as °C with °F in brackets', () => {
    expect(formatValue({}, 300.15, 'K')).toBe('27.0 °C (80.6 °F)');
  });
  it('shows °C layers with °F in brackets', () => {
    expect(formatValue({}, 28.1, '°C')).toBe('28.1 °C (82.6 °F)');
    expect(formatValue({}, -2, '°C')).toBe('-2.0 °C (28.4 °F)');
  });
  it('applies a display scale and unit', () => {
    expect(formatValue({ unit: 'mm/day', scale: 86400 }, 0.000034, 'kg/m²/s')).toBe('2.9 mm/day');
  });
  it('prefers the legend unit, then the indicator unit', () => {
    expect(formatValue({}, 1873, 'ppbv')).toBe('1873 ppbv');
    expect(formatValue({ unit: '% snow cover' }, 100, '')).toBe('100 % snow cover');
  });
});

describe('fmtNum', () => {
  it('keeps sensible precision at every magnitude', () => {
    expect(fmtNum(1873.4)).toBe('1873');
    expect(fmtNum(12.34)).toBe('12.3');
    expect(fmtNum(0.0456)).toBe('0.046');
  });
});
