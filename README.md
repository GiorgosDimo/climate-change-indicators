# Climate Change Indicators

An interactive 3D globe that plays georeferenced image data through time. Out of the box it shows ten key climate-change indicators from one data source (NASA GIBS), with no account, API key or backend. It can also show your own data, from a WMS server, a series of images or GeoTIFF files (see [Using your own data](#using-your-own-data)).

**Live demo: https://climate-change-indicators.vercel.app/**

The viewer is also published as a reusable React component, [`timeline-globe`](packages/timeline-globe), and this site is a demo built on it. See [Use as a library](#use-as-a-library).

## Purpose

Climate data is usually scattered across portals with different formats and logins. This app puts ten indicators on one globe so you can play them through time, compare regions and read actual values:

| # | Indicator | # | Indicator |
|---|-----------|---|-----------|
| 1 | Surface air temperature | 6 | Methane |
| 2 | Sea surface temperature | 7 | Ice and land water mass |
| 3 | Sea ice concentration | 8 | Snow cover |
| 4 | Sea level | 9 | Vegetation (NDVI) |
| 5 | Atmospheric CO₂ | 10 | Precipitation |

Each indicator has a description of what it is and how to read it.

## Features

- **Time controls:** weekly, monthly or yearly frames, a period range slider, play/pause and 1–10 fps speed.
- **Value picker:** hover or tap anywhere to read the value. It updates with every frame while the coordinates stay fixed. Temperatures show °C with °F in brackets.
- **Trend graph:** click or tap the globe to plant a flag on that pixel, then press Play (or drag the time slider). Each frame adds a point, and after five a line graph of that spot over time appears and keeps growing. A dashed trend line is fitted through the points. The ▾ button minimizes the graph to one line (the flag keeps collecting) and ▴ shows it again. The "Read values" button next to the legend turns this off for plain panning.
- **Legend and colours:** a legend per layer, plus original, Viridis, blue-red, grayscale or custom two-colour palettes, applied in the browser.
- **Detail on zoom:** zooming in loads a sharper image of the visible region.
- **Polar tilt** for sea ice, zoom buttons, and a mobile-friendly collapsible menu.
- **New-data check:** each time the page opens it looks for months published since the last visit and shows a notice (built-in catalog only).
- **Your own data:** the list of datasets is a catalog loaded from a JSON file with `?catalog=<url>`. Sources can be a WMS server, image files or GeoTIFFs.

## How it works

- Every frame is one pre-rendered whole-globe image: a PNG from the [GIBS WMS](https://nasa-gibs.github.io/gibs-api-docs/) (EPSG:4326), or from any WMS or image URL you configure. The client swaps images, so there is no video codec and seeking is instant.
- Frames are fetched ahead (6 frames), kept in an LRU cache of 40, and playback advances only when the next frame has loaded.
- Layers are swapped without blinking: the new layer is added almost transparent, rendered, then swapped in one step.
- GeoTIFF frames are read in the browser (the reader is loaded only when one is first needed), resampled onto the globe and painted with the legend, so from then on they behave like any other image.
- Values are read from the pixel colour by matching it to the layer's legend (the official GIBS colour map, or one you supply), taking the nearest legend bin, then converted to units.
- Where a layer has no daily product, weekly mode is disabled. Where GIBS returns a blank image for a date, the frame is skipped.

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router), React 18, TypeScript
- [CesiumJS](https://cesium.com/platform/cesiumjs/) 1.122 for the globe, loaded from its CDN on first use, with the bundled Natural Earth II basemap
- Plain CSS (no UI library), one small stylesheet
- [geotiff.js](https://geotiffjs.github.io/) for reading GeoTIFF files (loaded on demand)
- [Vitest](https://vitest.dev/), jsdom and Testing Library for tests
- Data and imagery: [NASA GIBS](https://earthdata.nasa.gov/gibs)

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts: `npm run build`, `npm start`, `npm test`, `npm run typecheck`, and `npm run build:lib` (builds the package into `packages/timeline-globe/dist`).

## Project layout

The repository is an npm workspace: the viewer is a package, and the Next.js app at the root is a demo of it.

```
app/                              the demo app
  page.tsx                          NASA GIBS catalog (or ?catalog=), new-data check
  gibs.ts                           the ten built-in GIBS indicators
  updates.ts                        new-data check
packages/timeline-globe/          the reusable viewer (published as `timeline-globe`)
  src/TimelineGlobe.tsx             page state: dataset, mode, frames, playback, menu
  src/components/GlobeView.tsx      Cesium globe, layer swap, detail overlay, hover value, flag
  src/components/TimeDock.tsx       legend, Read values button, time slider, play and speed
  src/components/TrendChart.tsx     line graph of the flagged pixel, with a fitted trend line
  src/components/RangeSlider.tsx    two-thumb period slider
  src/lib/indicators.ts             dates, frame schedules, frame URLs
  src/lib/catalog.ts                catalog format: checks and loads a catalog JSON file
  src/lib/cesium.ts                 loads CesiumJS from the CDN
  src/lib/frames.ts                 frame cache, colour-map parsing, pixel decoding
  src/lib/geotiff.ts                reads a GeoTIFF and paints it with a legend
  src/lib/palette.ts                palettes and client-side recolouring
  src/lib/series.ts                 values collected per pixel and the trend-line fit
  src/lib/format.ts                 value formatting (°C / °F, units)
  src/style.css                     all styles, scoped to .tg
  tests/                            unit tests of the package
tests/                            tests of the demo app (GIBS data, new-data check, whole-page behaviour)
examples/                         example catalog file
```

## Use as a library

```bash
npm install timeline-globe
```

```tsx
import { TimelineGlobe, parseCatalog } from 'timeline-globe';
import 'timeline-globe/style.css';

<TimelineGlobe catalog={parseCatalog(myCatalogJson)} />
```

See [packages/timeline-globe/README.md](packages/timeline-globe/README.md) for the API, the styling notes and self-hosting Cesium. The package is not published to npm yet; to publish it: `npm run build:lib`, then `npm publish -w timeline-globe`.

## Using your own data

The list of datasets is a *catalog*. The built-in one is NASA GIBS, and any other can be loaded from a JSON file:

```
https://climate-change-indicators.vercel.app/?catalog=https://your.host/catalog.json
```

See [examples/catalog.example.json](examples/catalog.example.json). Each indicator needs a `start` and `end` (`YYYY-MM-DD`), a source and a legend:

- **Source, either:**
  - `layer` (plus optional `wms`, the endpoint URL): any WMS 1.1.1 server with a `TIME` dimension that can answer in EPSG:4326, one whole-globe image per date.
  - `template`: an image URL with `{date}`, for example `https://host/frames/{date}.png`. `{width}`, `{height}` and `{bbox}` are filled in if present. Without `{bbox}` there is no extra detail when zooming.
  - `template` plus `"format": "geotiff"`: one GeoTIFF per date, for example `https://host/tifs/{date}.tif` (see below).
- **Legend, either:**
  - `legend`: `{ "units": "°C", "stops": [{ "value": 0, "color": "#0000ff" }, ...] }`, smoothed between the stops.
  - `colormap`: a GIBS colormap name, or the URL of a GIBS-format colormap XML.
  
  The legend colours must match the colours in the images, because values are read back from the pixel colour.
- **Optional:** `name`, `res` (image width in px), `alpha`, `north`, `everyDays`, `unit`, `scale`, `weekly` (same fields, used in Weekly mode), `about`, `howto`, `note`.

**GeoTIFF files** are read in the browser. They need:

- one band (the first is used) in latitude/longitude (EPSG:4326), with longitudes within -180..180. A file may cover only part of the globe; the rest stays empty. Other projections or 0..360 longitudes can be converted first with `gdalwarp -t_srs EPSG:4326 -te -180 -90 180 90 in.tif out.tif`.
- a `legend` (or `colormap`) whose values are in the file's units. Values outside it take its end colours, and the file's no-data value stays transparent.
- NetCDF is not read directly; convert it with `gdal_translate -b 1 in.nc out.tif`.

Hover values come from the painted image, so they are rounded to the 256 steps of the legend. Keep files modest (a few thousand pixels wide): each one is fully decoded in the browser. There is no extra detail on zoom for GeoTIFFs.

Frames are requested for the 1st of each month (or every `everyDays` days), so image names must follow that. Image and GeoTIFF files must be served with CORS enabled (or from the same site, with a path like `/data/{date}.tif`), because the app reads their pixels. URLs may be `https://...` or a path starting with `/`. The GIBS new-data check is off for custom catalogs. Only open catalog links you trust: a catalog controls which images and text the page shows.

## Deploying

It is a static-friendly Next.js app with no environment variables. Import the repository in [Vercel](https://vercel.com/new) and deploy with the defaults.

## License

The code is released under the [MIT License](LICENSE). The data and imagery it shows come from NASA GIBS and the underlying mission teams (see below), and are not covered by this license.

## Data credit

Imagery and data courtesy of NASA GIBS / Earthdata and the underlying mission teams (AIRS, MODIS, MUR SST, GHRSST, GRACE, IMERG and others). Check each layer's terms on the GIBS site before reuse.
