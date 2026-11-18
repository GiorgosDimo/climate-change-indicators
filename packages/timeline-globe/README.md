# timeline-globe

A React component that shows a 3D globe (CesiumJS) and plays georeferenced image data through time. It comes with a dataset menu, a legend and colour palettes, a time slider with play and speed, a value picker, and a trend graph for any pixel you flag.

Data can be:

- a **WMS** server with a `TIME` dimension (EPSG:4326),
- a series of **images** at a URL like `https://host/frames/{date}.png`,
- a series of **GeoTIFF** files at a URL like `https://host/tifs/{date}.tif`.

Live demo (NASA climate indicators built on it): https://climate-change-indicators.vercel.app/

## Install

```bash
npm install timeline-globe
```

It needs React 18 or newer. CesiumJS is **not** a dependency: it is loaded from the Cesium CDN the first time the globe is shown, so there is nothing to configure for Cesium's workers and assets (see [Self-hosting Cesium](#self-hosting-cesium)).

## Use

```tsx
import { TimelineGlobe, parseCatalog } from 'timeline-globe';
import 'timeline-globe/style.css';

// Build the catalog once (outside the component): parseCatalog checks it and registers its legends.
const catalog = parseCatalog({
  title: 'My Spatial Data',
  credit: 'Data: my own server',
  indicators: [{
    id: 'temp', name: 'Temperature',
    wms: 'https://example.org/wms', layer: 'temperature_monthly',   // or: template: 'https://host/{date}.png'
    start: '2000-01-01', end: '2024-12-01',
    legend: { units: '°C', stops: [{ value: -20, color: '#3b4cc0' }, { value: 40, color: '#b40426' }] }, // must match the image colours
    about: 'What this layer shows.', howto: 'How to read it.',
  }],
});

export default function Page() {
  return <div style={{ width: '100vw', height: '100vh' }}><TimelineGlobe catalog={catalog} /></div>;
}
```

The viewer fills its container, so give the container a size. In Next.js, use it from a client component (the package is already marked `'use client'`).

### Catalogs from JSON

The same catalog can live in a JSON file:

```ts
import { loadCatalog, parseCatalog } from 'timeline-globe';

const catalog = await loadCatalog('https://your.host/catalog.json'); // fetches, checks and registers legends
const same = parseCatalog(jsonObject);                               // checks an object you already have
```

`parseCatalog` fills defaults, rejects bad input with a message that says which field is wrong, and turns a `legend` into the colour map the viewer needs. Always create catalogs through it. The format is documented in the [repository README](https://github.com/GiorgosDimo/climate-change-indicators#using-your-own-data) and in [`examples/catalog.example.json`](https://github.com/GiorgosDimo/climate-change-indicators/blob/main/examples/catalog.example.json).

## API

| Export | What it is |
|--------|------------|
| `TimelineGlobe` | The viewer. Props: `catalog`, `cesiumUrl?`, `className?`, `style?`. |
| `parseCatalog(json)` | Validates a catalog object and returns a `Catalog`. |
| `loadCatalog(url)` | Fetches a catalog JSON file and runs `parseCatalog`. |
| `frameUrl(source, date, width, bbox?, height?)` | The image URL the viewer requests for a date. |
| `addMonth(iso)` | The first day of the next month, as `YYYY-MM-DD`. |
| types | `Catalog`, `Indicator`, `Variant`, `TimelineGlobeProps` |

## Things to know

- **Whole-globe images only.** Each frame must cover the whole globe in latitude/longitude (EPSG:4326). A GeoTIFF may cover part of it.
- **The legend must match the image colours**, because values are read back from the pixel colour.
- **CORS.** Images and GeoTIFFs must be served with CORS enabled (or from your own site), because the viewer reads their pixels.
- **Styling.** All CSS is scoped to the `.tg` class, so it will not touch your page. It is sized in pixels and sets a dark theme; override the `--panel`, `--accent`, `--line` and `--muted` CSS variables on `.tg` to recolour it. Small-screen layout follows the browser window, not the container.
- **Network.** Cesium (and, unless you pass `cesiumUrl`, its assets) comes from a CDN, so the globe needs internet access.

### Self-hosting Cesium

Copy the contents of a CesiumJS release's `Build/Cesium` folder to your server and point the component at it:

```tsx
<TimelineGlobe catalog={catalog} cesiumUrl="/vendor/cesium" />
```

It must contain `Cesium.js` and `Widgets/widgets.css`. The viewer was built against CesiumJS 1.122.

## License

MIT
