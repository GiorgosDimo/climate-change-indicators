# Climate Change Indicators

An interactive 3D globe that plays georeferenced image data through time. Out of the box it shows ten key climate-change indicators from one data source (NASA GIBS), with no account, API key or backend. It can also show your own data, from a WMS server or a series of images (see [Using your own data](#using-your-own-data)).

**Live demo: https://climate-change-indicators.vercel.app/**

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
- **Your own data:** the list of datasets is a catalog loaded from a JSON file with `?catalog=<url>`.

## How it works

- Every frame is one pre-rendered whole-globe image: a PNG from the [GIBS WMS](https://nasa-gibs.github.io/gibs-api-docs/) (EPSG:4326), or from any WMS or image URL you configure. The client swaps images, so there is no video codec and seeking is instant.
- Frames are fetched ahead (6 frames), kept in an LRU cache of 40, and playback advances only when the next frame has loaded.
- Layers are swapped without blinking: the new layer is added almost transparent, rendered, then swapped in one step.
- Values are read from the pixel colour by matching it to the layer's legend (the official GIBS colour map, or one you supply), taking the nearest legend bin, then converted to units.
- Where a layer has no daily product, weekly mode is disabled. Where GIBS returns a blank image for a date, the frame is skipped.

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router), React 18, TypeScript
- [CesiumJS](https://cesium.com/platform/cesiumjs/) 1.122 (loaded from CDN) for the globe, with the bundled Natural Earth II basemap
- Plain CSS (no UI library), one small stylesheet
- [Vitest](https://vitest.dev/), jsdom and Testing Library for tests
- Data and imagery: [NASA GIBS](https://earthdata.nasa.gov/gibs)

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts: `npm run build`, `npm start`, `npm test`, `npm run typecheck`.

## Project layout

```
app/page.tsx              page state: indicator, mode, frames, playback, menu
components/GlobeView.tsx  Cesium globe, layer swap, detail overlay, hover value
components/TimeDock.tsx   legend, Read values button, time slider, play and speed
components/TrendChart.tsx line graph of the flagged pixel, with a fitted trend line
components/RangeSlider.tsx two-thumb period slider
lib/indicators.ts         the ten built-in indicators, date and frame logic, frame URLs
lib/catalog.ts            catalog format: checks and loads a catalog JSON file
lib/frames.ts             frame cache, colour-map parsing, pixel decoding
lib/palette.ts            palettes and client-side recolouring
lib/series.ts             values collected per pixel and the trend-line fit
lib/format.ts             value formatting (°C / °F, units)
lib/updates.ts            new-data check
tests/                    unit and integration tests
examples/                 example catalog file
```

## Using your own data

The list of datasets is a *catalog*. The built-in one is NASA GIBS, and any other can be loaded from a JSON file:

```
https://climate-change-indicators.vercel.app/?catalog=https://your.host/catalog.json
```

See [examples/catalog.example.json](examples/catalog.example.json). Each indicator needs a `start` and `end` (`YYYY-MM-DD`), a source and a legend:

- **Source, either:**
  - `layer` (plus optional `wms`, the endpoint URL): any WMS 1.1.1 server with a `TIME` dimension that can answer in EPSG:4326, one whole-globe image per date.
  - `template`: an image URL with `{date}`, for example `https://host/frames/{date}.png`. `{width}`, `{height}` and `{bbox}` are filled in if present. Without `{bbox}` there is no extra detail when zooming.
- **Legend, either:**
  - `legend`: `{ "units": "°C", "stops": [{ "value": 0, "color": "#0000ff" }, ...] }`, smoothed between the stops.
  - `colormap`: a GIBS colormap name, or the URL of a GIBS-format colormap XML.
  
  The legend colours must match the colours in the images, because values are read back from the pixel colour.
- **Optional:** `name`, `res` (image width in px), `alpha`, `north`, `everyDays`, `unit`, `scale`, `weekly` (same fields, used in Weekly mode), `about`, `howto`, `note`.

Frames are requested for the 1st of each month (or every `everyDays` days), so image names must follow that. Images must be served with CORS enabled, because the app reads their pixels. The GIBS new-data check is off for custom catalogs. Only open catalog links you trust: a catalog controls which images and text the page shows.

## Deploying

It is a static-friendly Next.js app with no environment variables. Import the repository in [Vercel](https://vercel.com/new) and deploy with the defaults.

## Data credit

Imagery and data courtesy of NASA GIBS / Earthdata and the underlying mission teams (AIRS, MODIS, MUR SST, GHRSST, GRACE, IMERG and others). Check each layer's terms on the GIBS site before reuse.
