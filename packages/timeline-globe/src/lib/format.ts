export const fmtNum = (v: number) =>
  Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toPrecision(2);

interface Units { unit?: string; scale?: number }

/** Text for the value picker. Temperatures are always °C with °F in brackets. */
export function formatValue(v: Units, value: number, legendUnits: string): string {
  if (legendUnits === 'K' || legendUnits === '°C') {
    const c = legendUnits === 'K' ? value - 273.15 : value;
    return `${c.toFixed(1)} °C (${((c * 9) / 5 + 32).toFixed(1)} °F)`;
  }
  if (v.scale) return `${fmtNum(value * v.scale)} ${v.unit ?? ''}`.trim();
  return `${fmtNum(value)} ${legendUnits || v.unit || ''}`.trim();
}
