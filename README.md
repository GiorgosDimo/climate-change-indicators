# Climate Change Indicators

An interactive 3D globe that shows ten key climate-change indicators over time, from one data source (NASA GIBS), with no account, API key or backend.

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
- **Legend and colours:** a legend per layer, plus original, Viridis, blue-red, grayscale or custom two-colour palettes, applied in the browser.
- **Detail on zoom:** zooming in loads a sharper image of the visible region.
- **Polar tilt** for sea ice, zoom buttons, and a mobile-friendly collapsible menu.
- **New-data check:** each time the page opens it looks for months published since the last visit and shows a notice.

## How it works

- Every frame is one pre-rendered whole-globe PNG from the [GIBS WMS](https://nasa-gibs.github.io/gibs-api-docs/) (EPSG:4326). The client swaps images, so there is no video codec and seeking is instant.
- Frames are fetched ahead (6 frames), kept in an LRU cache of 40, and playback advances only when the next frame has loaded.
- Layers are swapped without blinking: the new layer is added almost transparent, rendered, then swapped in one step.
- Values are read from the pixel colour by matching it to the layer's official GIBS colour map (nearest legend bin), then converted to units.
- Where a layer has no daily product, weekly mode is disabled. Where GIBS returns a blank image for a date, the frame is skipped.

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router), React 18, TypeScript
- [CesiumJS](https://cesium.com/platform/cesiumjs/) 1.122 (loaded from CDN) for the globe, with the bundled Natural Earth II basemap
- [MUI](https://mui.com/) with a dark theme
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
components/TimeDock.tsx   legend, time slider, play and speed
lib/indicators.ts         the ten indicators, GIBS layers, date and frame logic
lib/frames.ts             frame cache, colour-map parsing, pixel decoding
lib/palette.ts            palettes and client-side recolouring
lib/format.ts             value formatting (°C / °F, units)
lib/updates.ts            new-data check
tests/                    unit and integration tests
```

## Deploying

It is a static-friendly Next.js app with no environment variables. Import the repository in [Vercel](https://vercel.com/new) and deploy with the defaults.

## Data credit

Imagery and data courtesy of NASA GIBS / Earthdata and the underlying mission teams (AIRS, MODIS, MUR SST, GHRSST, GRACE, IMERG and others). Check each layer's terms on the GIBS site before reuse.
