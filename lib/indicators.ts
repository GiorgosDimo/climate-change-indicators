// Ten climate-change indicators served by NASA GIBS as one whole-globe image per date (WMS).
// Layer IDs, ranges and colormap names verified against the GIBS capabilities (2026-11-17).
// GIBS does not snap dates: a date with no data returns a blank image, so frames must be
// requested on each layer's real cadence (everyDays) and gaps simply play as blank frames.

export type Mode = 'week' | 'month' | 'year';

export interface Variant {
  layer: string;
  colormap: string;    // GIBS colormap file name, used to turn pixel colour back into a value
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

export const INDICATORS: Indicator[] = [
  { id: 'air-temp', name: 'Surface air temperature', layer: 'MERRA2_2m_Air_Temperature_Monthly',
    colormap: 'MERRA2_2m_Air_Temperature_Monthly', start: '1980-01-01', end: '2026-08-01', res: 720, alpha: 0.55, ongoing: true,
    weekly: { layer: 'AIRS_L3_Surface_Air_Temperature_Daily_Day', colormap: 'AIRS_Surface_Air_Temperature_Daily_Day', start: '2002-09-01', end: '2026-11-08' },
    about: 'Average temperature of the air about 2 m above the surface, from NASA\'s MERRA-2 reanalysis, which blends satellite and ground observations into one consistent global record since 1980. Weekly mode uses daily AIRS satellite data instead.',
    howto: 'Warmer colours mean warmer air. The seasons dominate the picture, so compare the same month in different years (Yearly mode) to see warming; Arctic land warms fastest. Hover or tap to read the temperature.',
    note: 'A few months in 2023-24 are missing and play as blank frames.' },
  { id: 'sst', name: 'Sea surface temperature', layer: 'MODIS_Aqua_L3_SST_Thermal_9km_Day_Monthly',
    colormap: 'MODIS_Sea_Surface_Temperature', start: '2002-07-01', end: '2026-04-01', res: 1440, alpha: 0.9, ongoing: true,
    weekly: { layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature', colormap: 'GHRSST_Sea_Surface_Temperature', start: '2002-06-01', end: '2026-11-16' },
    about: 'Temperature of the top layer of the ocean, measured by the MODIS Aqua satellite and averaged per month. Weekly mode uses the daily MUR analysis. The ocean absorbs over 90% of the extra heat trapped by greenhouse gases, so this is a surface proxy for ocean heat.',
    howto: 'Reds are warm water, blues are cold. Watch the tropical Pacific for El Niño (a warm tongue along the equator) and for warm areas that persist or spread across years, which stress coral reefs and feed storms. No colour means no data (cloud or ice).',
    note: 'Surface only: GIBS has no ocean heat content layer.' },
  { id: 'sea-ice', name: 'Sea ice concentration', layer: 'GHRSST_L4_MUR_Sea_Ice_Concentration',
    colormap: 'GHRSST_Sea_Ice_Concentration', start: '2002-06-01', end: '2026-11-01', res: 1440, alpha: 0.9, north: true, ongoing: true,
    weekly: { layer: 'GHRSST_L4_MUR_Sea_Ice_Concentration', colormap: 'GHRSST_Sea_Ice_Concentration', start: '2002-06-01', end: '2026-11-16' },
    about: 'The share of each ocean cell that is covered by sea ice, from the daily MUR analysis. Arctic sea ice has been shrinking for decades, most strongly at its September minimum.',
    howto: '100% means solid ice, low percentages mean broken or thin ice, no colour means open water. Start the period in September and use Yearly mode to compare each summer minimum and watch the ice edge retreat.',
    note: 'No monthly product exists, so Monthly and Yearly show a snapshot of the 1st of each month, not an average.' },
  { id: 'sea-level', name: 'Sea level anomaly', layer: 'JPL_MEaSUREs_L4_Sea_Surface_Height_Anomalies',
    colormap: 'MEaSUREs_Sea_Surface_Height_Anomalies', start: '1992-09-30', end: '2019-01-22', everyDays: 5, res: 1440, alpha: 0.9,
    weekly: { layer: 'JPL_MEaSUREs_L4_Sea_Surface_Height_Anomalies', colormap: 'MEaSUREs_Sea_Surface_Height_Anomalies', start: '1992-09-30', end: '2019-01-22', everyDays: 5 },
    about: 'How much higher or lower the ocean surface is compared with a long-term average, measured by radar altimeter satellites (TOPEX/Poseidon and the Jason series). The global average has risen about 3-4 mm per year.',
    howto: 'Warm colours mean water above average, cool colours below. The map is dominated by El Niño, ocean currents and eddies; the slow global rise is too small to see in a single frame. Weekly mode steps every 5 days, the data\'s own cadence.',
    note: 'The record ends in January 2019. Monthly mode uses the first 5-day step of each month.' },
  { id: 'co2', name: 'Atmospheric CO₂', layer: 'AIRS_L3_Carbon_Dioxide_AIRS_AMSU_Monthly',
    colormap: 'AIRS_Carbon_Dioxide_AIRS_AMSU_Monthly', start: '2002-09-01', end: '2012-02-01', res: 720, alpha: 0.55,
    about: 'Carbon dioxide in the middle of the troposphere (several km up), retrieved from NASA\'s AIRS instrument. CO₂ is the main human-made greenhouse gas.',
    howto: 'Values are in ppm, higher means more CO₂. The colour scale is narrow, so look for the steady rise from year to year and the seasonal rhythm in the northern hemisphere. This is not surface air, so it will not match ground stations exactly.',
    note: 'Regular monthly data ends in February 2012.' },
  { id: 'methane', name: 'Methane', layer: 'AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Monthly_Day',
    colormap: 'AIRS_Methane_Volume_Mixing_Ratio', start: '2002-09-01', end: '2026-09-01', res: 720, alpha: 0.55, ongoing: true,
    weekly: { layer: 'AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Daily_Day', colormap: 'AIRS_Methane_Volume_Mixing_Ratio', start: '2002-09-01', end: '2026-11-09' },
    about: 'Methane at about 7 km altitude (400 hPa), from the AIRS instrument. Methane traps far more heat than CO₂ per molecule and comes from wetlands, farming, and oil and gas.',
    howto: 'Values are in ppbv; darker reds mean more methane. Look for high concentrations over South and East Asia and the tropics, and for a slow overall rise across years. Daytime data only.',
    note: 'Some months are missing and play as blank frames.' },
  { id: 'ice-mass', name: 'Ice & land water mass', layer: 'GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI',
    colormap: 'GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI', start: '2002-08-01', end: '2022-07-01', res: 1440, alpha: 0.9,
    about: 'Change in the mass of water and ice on land, measured by the GRACE satellites from tiny changes in gravity and shown as the equivalent thickness of liquid water, relative to a 2004-2009 baseline.',
    howto: 'Negative values (loss) show where ice sheets, glaciers or groundwater are shrinking, for example Greenland, West Antarctica and Alaska. Positive values show gain. The data is physically coarse (hundreds of km), so single cells are not meaningful on their own.',
    note: 'GRACE has gaps (for example 2015 and 2017-18) that play as blank frames, and ends in July 2022.' },
  { id: 'snow', name: 'Snow cover', layer: 'MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct',
    colormap: 'MODIS_NDSI_Snow_Cover', start: '2000-03-01', end: '2026-10-01', res: 1440, alpha: 0.9, unit: '% snow cover', ongoing: true,
    weekly: { layer: 'MODIS_Terra_NDSI_Snow_Cover', colormap: 'MODIS_NDSI_Snow_Cover', start: '2000-02-24', end: '2026-11-17', unit: '% snow cover' },
    about: 'How much of each area is snow covered, from the MODIS Terra satellite (monthly average). Snow reflects sunlight, so losing it speeds up warming, and it also stores water for rivers.',
    howto: 'Higher percentages mean snow was present more of the month. Compare the same winter or spring month across years; shrinking spring snow and earlier melt are climate signals. No colour means no snow, cloud or polar night.',
    note: 'Weekly mode uses daily snapshots, which are patchy where there is cloud.' },
  { id: 'ndvi', name: 'Vegetation greenness (NDVI)', layer: 'MODIS_Terra_L3_NDVI_Monthly',
    colormap: 'MODIS_L3_NDVI', start: '2000-03-01', end: '2026-10-01', res: 1440, alpha: 0.9, ongoing: true,
    about: 'The Normalized Difference Vegetation Index from MODIS Terra: how strongly land reflects near-infrared light compared with red, which is high for healthy green plants.',
    howto: 'Around 0.1 or less is bare ground, rock or snow, 0.2-0.5 is grass, shrubs and crops, and 0.6-0.9 is dense forest. Watch the seasonal greening wave, and compare years for drought, deforestation or greening.',
    note: 'Monthly composites; no weekly product.' },
  { id: 'precip', name: 'Precipitation', layer: 'MERRA2_Precipitation_Bias_Corrected_Monthly',
    colormap: 'MERRA2_Precipitation_Bias_Corrected_Monthly', start: '2000-05-01', end: '2026-08-01', res: 720, alpha: 0.75, unit: 'mm/day', scale: 86400, ongoing: true,
    weekly: { layer: 'IMERG_Precipitation_Rate', colormap: 'GPM_Precipitation_Rate', start: '2000-06-01', end: '2026-11-16', unit: 'mm/day', scale: 24 },
    about: 'Average rainfall and snowfall rate from NASA\'s MERRA-2 reanalysis, bias-corrected with observations. Weekly mode uses the IMERG satellite rain product. A warmer atmosphere holds more water, making heavy rain and drought more extreme.',
    howto: 'Darker colours mean more precipitation, in mm per day. Look for the rain band near the equator, monsoons and storm tracks, and compare the same month in different years to spot unusually wet or dry seasons.',
    note: 'In weekly mode, areas with under 0.1 mm/hr are left blank.' },
];

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

export const frameUrl = (layer: string, date: string, width: number, bbox: BBox = [-180, -90, 180, 90], height?: number) => {
  const h = height ?? Math.round((width * (bbox[3] - bbox[1])) / (bbox[2] - bbox[0]));
  return 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1' +
    `&SRS=EPSG:4326&BBOX=${bbox.join(',')}&WIDTH=${width}&HEIGHT=${h}&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=` +
    `&LAYERS=${layer}&TIME=${date}`;
};

export const fmtDate = (iso: string) => iso.split('-').reverse().join('/'); // dd/mm/yyyy

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Weekly frames show the full date, monthly "Mar 2020", yearly "2020". */
export const fmtFor = (iso: string, mode: Mode) =>
  mode === 'week' ? fmtDate(iso) : mode === 'year' ? iso.slice(0, 4) : `${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
