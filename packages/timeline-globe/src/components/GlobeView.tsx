'use client';

import { useEffect, useRef, useState } from 'react';
import { decode, loadColormap, loadFrame, type Colormap } from '../lib/frames';
import { recolorBitmap, type Palette } from '../lib/palette';
import type { BBox } from '../lib/indicators';
import { loadCesium } from '../lib/cesium';

export interface Hover { x: number; y: number; lat: number; lon: number; value: string }
/** Value of the flagged pixel in one frame. */
export interface Sample { num: number | null; src: string; pin: [number, number] }

interface Props {
  src: string | null;      // whole-globe image URL of the current frame
  detailUrl: (bbox: BBox, width: number, height: number) => string | null; // same frame, zoomed-in area
  colormap: string;        // legend name, for the value picker
  format: (value: number, legendUnits: string) => string;
  alpha: number;
  palette: Palette;
  north: boolean;          // tilt to the north pole
  onHover: (h: Hover | null) => void;
  values: boolean;         // read values on hover/tap (off: plain panning)
  pin: [number, number] | null; // flagged pixel centre (lat, lon)
  onPick: (cell: [number, number]) => void; // click or tap: plant the flag
  onSample: (s: Sample) => void; // flagged pixel's value, once per new frame
  sampleKey: string;       // when this changes (a new series starts) the flagged pixel is read again from the frame on screen
  cesiumUrl?: string;      // where to load CesiumJS from (default: the CDN)
}

const MIN_DIST = 3e6;        // ~tile level 4: closest zoom
const MAX_DIST = 4e7;
const DETAIL_BELOW = 9e6;    // fetch a sharper image of the visible area below this camera height
const FADE = 0.01;           // not 0: Cesium skips layers at alpha 0, so they would never load

export default function GlobeView({ src, detailUrl, colormap, format, alpha, palette, north, onHover, values, pin, onPick, onSample, sampleKey, cesiumUrl }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [flagInfo, setFlagInfo] = useState<{ value: string; coords: string } | null>(null); // text beside the flag
  const [ready, setReady] = useState(false); // the Cesium viewer exists
  const [error, setError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewer = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail = useRef<any>(null);
  const bmp = useRef<ImageBitmap | null>(null);
  const bmpSrc = useRef('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flag = useRef<any>(null);
  const cmap = useRef<Colormap | null>(null);
  const flying = useRef(false);
  const lastPick = useRef<{ x: number; y: number; lat: number; lon: number } | null>(null);
  const cmName = useRef(''), bmpCmName = useRef(''); // legend the loaded colormap / current image belong to
  const latest = useRef({ alpha, format, detailUrl, onHover, palette, colormap, values, pin, onSample, onPick });
  latest.current = { alpha, format, detailUrl, onHover, palette, colormap, values, pin, onSample, onPick };
  const paletteKey = `${palette.id}${palette.low}${palette.high}`;
  const api = useRef({
    scheduleDetail: () => {}, clearDetail: () => {}, settle: async () => {},
    display: async (f: { url: string; blob: Blob }) => f.url,
    refresh: () => {}, placeTip: () => {}, snap: (lat: number, lon: number): [number, number] => [lat, lon],
  });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const start = (C: any) => {
      C.Ion.defaultAccessToken = '';
      // Render only on change (not 60 fps), no animation widgets, no default Ion imagery.
      const v = new C.Viewer(el, {
        baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
        navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
        selectionIndicator: false, infoBox: false,
        requestRenderMode: true, maximumRenderTimeChange: Infinity,
      });
      viewer.current = v;
      v.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK); // Cesium's default: track the entity
      // flyTo tweens don't wake a requestRenderMode scene by themselves
      v.clock.onTick.addEventListener(() => { if (flying.current) v.scene.requestRender(); });
      v.scene.screenSpaceCameraController.minimumZoomDistance = MIN_DIST;
      v.scene.screenSpaceCameraController.maximumZoomDistance = MAX_DIST;
      // Bundled low-res Natural Earth II: a few KB of tiles, no external map server.
      C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl('Assets/Textures/NaturalEarthII'))
        .then((p: unknown) => {
          if (v.isDestroyed()) return; // React strict mode mounts twice in dev
          v.imageryLayers.addImageryProvider(p, 0);
          v.scene.requestRender();
        });

      // Image URL to show: the original, or a repainted copy when a palette is chosen.
      const display = async (f: { url: string; blob: Blob }) => {
        const { palette: pal, colormap: name } = latest.current;
        if (pal.id === 'original') return f.url;
        const [cm, b] = await Promise.all([loadColormap(name), createImageBitmap(f.blob, { premultiplyAlpha: 'none' })]);
        const out = URL.createObjectURL(await recolorBitmap(b, cm, pal));
        b.close();
        return out;
      };

      // Wait a few rendered frames so a new layer is really on screen before the old one goes.
      const settle = () => new Promise<void>(res => {
        let n = 0;
        const off = v.scene.postRender.addEventListener(() => {
          v.scene.requestRender();
          if ((++n >= 3 && v.scene.globe.tilesLoaded) || n > 40) { off(); res(); }
        });
        v.scene.requestRender();
      });

      // Sharper image of just the visible area once the camera has stopped, zoomed in and the frame is stable.
      let timer: ReturnType<typeof setTimeout> | undefined, token = 0;
      const clearDetail = () => {
        token++; clearTimeout(timer);
        if (v.isDestroyed()) return;
        if (detail.current) { v.imageryLayers.remove(detail.current); detail.current = null; }
        if (layer.current) layer.current.alpha = latest.current.alpha;
        v.scene.requestRender();
      };
      const scheduleDetail = () => {
        clearDetail();
        const mine = token;
        timer = setTimeout(async () => {
          if (v.isDestroyed() || v.camera.positionCartographic.height > DETAIL_BELOW) return;
          const r = v.camera.computeViewRectangle();
          if (!r || r.east < r.west) return; // not visible as one box, or crosses the antimeridian
          const deg = C.Math.toDegrees;
          const padLon = (deg(r.east) - deg(r.west)) * 0.05, padLat = (deg(r.north) - deg(r.south)) * 0.05;
          const box: BBox = [
            Math.max(-180, deg(r.west) - padLon), Math.max(-90, deg(r.south) - padLat),
            Math.min(180, deg(r.east) + padLon), Math.min(90, deg(r.north) + padLat),
          ];
          const dLon = box[2] - box[0], dLat = box[3] - box[1];
          const k = 1600 / Math.max(dLon, dLat); // longest side 1600 px
          const url = latest.current.detailUrl(box, Math.round(dLon * k), Math.round(dLat * k));
          if (!url) return;
          try {
            const f = await loadFrame(url);
            const shown = await display(f);
            const p = await C.SingleTileImageryProvider.fromUrl(shown, { rectangle: C.Rectangle.fromDegrees(...box) });
            if (shown !== f.url) URL.revokeObjectURL(shown);
            if (token !== mine || v.isDestroyed()) return;
            const l = v.imageryLayers.addImageryProvider(p);
            l.alpha = FADE;
            await settle();
            if (token !== mine || v.isDestroyed()) { v.imageryLayers.remove(l); return; }
            l.alpha = latest.current.alpha;
            if (layer.current) layer.current.alpha = FADE;
            detail.current = l;
            v.scene.requestRender();
          } catch { /* no detail for this area: keep the coarse image */ }
        }, 700);
      };
      Object.assign(api.current, { scheduleDetail, clearDetail, settle, display });
      v.camera.moveStart.addEventListener(() => { clearDetail(); lastPick.current = null; latest.current.onHover(null); });
      v.camera.moveEnd.addEventListener(scheduleDetail);

      // Value of the image pixel at a spot (null until the image and its legend belong together).
      const read = (lat: number, lon: number) => {
        const b = bmp.current, cm = cmap.current;
        if (!b || !cm || cmName.current !== bmpCmName.current) return null;
        const px = Math.min(b.width - 1, Math.floor(((lon + 180) / 360) * b.width));
        const py = Math.min(b.height - 1, Math.floor(((90 - lat) / 180) * b.height));
        const ctx = new OffscreenCanvas(1, 1).getContext('2d')!;
        ctx.drawImage(b, px, py, 1, 1, 0, 0, 1, 1);
        const [r, g, bl, a] = ctx.getImageData(0, 0, 1, 1).data;
        return {
          num: a < 128 ? null : decode(cm, r, g, bl), units: cm.units,
          cell: [90 - ((py + 0.5) / b.height) * 180, -180 + ((px + 0.5) / b.width) * 360] as [number, number],
        };
      };
      // Tooltip under a fixed spot. Re-run on every new frame so the number follows the animation.
      const emit = (at: { x: number; y: number; lat: number; lon: number }) => {
        const v = read(at.lat, at.lon);
        if (v) latest.current.onHover({ ...at, value: v.num === null ? 'No data' : latest.current.format(v.num, v.units) });
      };
      // The flagged pixel is sampled on every new frame, whatever the pointer is doing.
      const samplePin = () => {
        const pin = latest.current.pin, v = pin && read(pin[0], pin[1]);
        if (!pin || !v) return;
        const value = v.num === null ? 'No data' : latest.current.format(v.num, v.units), coords = `${pin[0].toFixed(2)}°, ${pin[1].toFixed(2)}°`;
        setFlagInfo(f => (f?.value === value && f.coords === coords ? f : { value, coords }));
        // keyed by the flag itself: the pixel grid differs between layers, the flag does not
        latest.current.onSample({ num: v.num, src: bmpSrc.current, pin: [pin[0], pin[1]] });
      };
      api.current.refresh = () => { if (lastPick.current) emit(lastPick.current); samplePin(); };
      // The value box beside the flag is plain HTML (a Cesium label is drawn at low resolution on phones);
      // it is moved to the flag's screen position whenever the globe is redrawn.
      api.current.placeTip = () => {
        const el = tipRef.current, pin = latest.current.pin;
        if (!el || !pin) return;
        const at = C.Cartesian3.fromDegrees(pin[1], pin[0]);
        const win = C.SceneTransforms.worldToWindowCoordinates(v.scene, at);
        const visible = win && new C.EllipsoidalOccluder(C.Ellipsoid.WGS84, v.camera.positionWC).isPointVisible(at);
        el.style.display = visible ? '' : 'none';
        if (visible) el.style.transform = `translate(${win.x + 22}px, ${win.y - 26 - el.offsetHeight}px)`;
      };
      v.scene.postRender.addEventListener(() => api.current.placeTip());
      api.current.snap = (lat: number, lon: number) => read(lat, lon)?.cell ?? [lat, lon];
      // Hover on desktop, tap on touch screens.
      const pick = (pos: { x: number; y: number }) => {
        if (!latest.current.values) return;
        const p = v.camera.pickEllipsoid(pos, v.scene.globe.ellipsoid);
        if (!p) { lastPick.current = null; return latest.current.onHover(null); }
        const c = C.Cartographic.fromCartesian(p);
        lastPick.current = { x: pos.x, y: pos.y, lat: C.Math.toDegrees(c.latitude), lon: deg180(C.Math.toDegrees(c.longitude)) };
        emit(lastPick.current);
      };
      const h = new C.ScreenSpaceEventHandler(v.scene.canvas);
      h.setInputAction((m: { endPosition: { x: number; y: number } }) => pick(m.endPosition), C.ScreenSpaceEventType.MOUSE_MOVE);
      h.setInputAction((m: { position: { x: number; y: number } }) => {
        pick(m.position);
        const at = lastPick.current;
        if (at && latest.current.values) {
          latest.current.onPick(api.current.snap(at.lat, at.lon));
          lastPick.current = null; latest.current.onHover(null); // the flag's own value box takes over from the hover tooltip
        }
      }, C.ScreenSpaceEventType.LEFT_CLICK);

      return () => { clearTimeout(timer); v.destroy(); viewer.current = null; layer.current = null; detail.current = null; flag.current = null; };
    };
    let stop: (() => void) | undefined, dead = false;
    loadCesium(cesiumUrl).then(C => { if (!dead) { stop = start(C); setReady(true); } }).catch(e => setError(e.message));
    return () => { dead = true; stop?.(); setReady(false); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // New frame: add the new layer faded out, wait until it has rendered, then swap in one step.
  // (Fading in over the old layer would stack two translucent layers and flash darker.)
  useEffect(() => {
    const v = viewer.current;
    if (!v || !src) return;
    let stale = false;
    loadFrame(src).then(async f => {
      const shown = await api.current.display(f);
      const p = await window.Cesium.SingleTileImageryProvider.fromUrl(shown);
      if (shown !== f.url) URL.revokeObjectURL(shown);
      const b = await createImageBitmap(f.blob, { premultiplyAlpha: 'none' }); // picker reads the original colours
      if (stale || v.isDestroyed()) { b.close(); return; }
      api.current.clearDetail();
      const next = v.imageryLayers.addImageryProvider(p);
      next.alpha = FADE;
      await api.current.settle();
      if (stale || v.isDestroyed()) { if (!v.isDestroyed()) v.imageryLayers.remove(next); b.close(); return; }
      next.alpha = latest.current.alpha;
      if (layer.current) v.imageryLayers.remove(layer.current);
      layer.current = next;
      bmp.current?.close();
      bmp.current = b;
      bmpSrc.current = src;
      bmpCmName.current = latest.current.colormap;
      api.current.refresh();
      v.scene.requestRender();
      api.current.scheduleDetail();
    }).catch(() => {});
    return () => { stale = true; };
  }, [src, paletteKey, ready]);

  useEffect(() => {
    if (!viewer.current || viewer.current.isDestroyed()) return;
    const target = detail.current ? FADE : alpha;
    if (layer.current) layer.current.alpha = target;
    if (detail.current) detail.current.alpha = alpha;
    viewer.current.scene.requestRender();
  }, [alpha, ready]);

  useEffect(() => {
    let dead = false;
    cmap.current = null;
    cmName.current = '';
    loadColormap(colormap).then(c => { if (!dead) { cmap.current = c; cmName.current = colormap; api.current.refresh(); } }).catch(() => {});
    return () => { dead = true; };
  }, [colormap]);

  useEffect(() => {
    if (!values) { lastPick.current = null; onHover(null); }
  }, [values, onHover]);

  // A new series (another layer or time step) reads the flagged pixel again, so the frame on screen counts as its first point.
  useEffect(() => { api.current.refresh(); }, [sampleKey]);

  useEffect(() => {
    if (!pin) setFlagInfo(null);
    api.current.placeTip();
  }, [flagInfo, pin?.[0], pin?.[1], ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flag on the pixel being read; sample it right away so a paused frame already counts.
  useEffect(() => {
    const v = viewer.current, C = window.Cesium;
    if (!v || v.isDestroyed()) return;
    if (!pin) { if (flag.current) flag.current.show = false; } else {
      const position = C.Cartesian3.fromDegrees(pin[1], pin[0]);
      if (flag.current) { flag.current.position = position; flag.current.show = true; } else {
        flag.current = v.entities.add({
          position,
          billboard: { image: FLAG, width: 34, height: 44, verticalOrigin: C.VerticalOrigin.BOTTOM },
        });
      }
      api.current.refresh();
    }
    v.scene.requestRender();
  }, [pin?.[0], pin?.[1], ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = viewer.current, C = window.Cesium;
    if (!v) return;
    v.camera.flyTo({
      destination: north ? C.Cartesian3.fromDegrees(0, 90, 1.4e7) : C.Cartesian3.fromDegrees(0, 20, 2.4e7),
      orientation: { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 },
      duration: 1.2,
      complete: () => { flying.current = false; },
      cancel: () => { flying.current = false; },
    });
    flying.current = true;
  }, [north, ready]);

  const zoom = (factor: number) => {
    const v = viewer.current;
    if (!v) return;
    const h = v.camera.positionCartographic.height;
    const t = Math.min(MAX_DIST, Math.max(MIN_DIST, h * factor));
    if (t < h) v.camera.zoomIn(h - t); else v.camera.zoomOut(t - h);
  };

  return (
    <div className="tg-globe">
      {error && <p className="tg-err" style={{ position: 'absolute', margin: 16 }}>{error}</p>}
      <div ref={boxRef} className={`tg-globe-view${values ? '' : ' tg-grab'}`} onMouseLeave={() => { lastPick.current = null; onHover(null); }} />
      {pin && flagInfo && (
        <div ref={tipRef} className="tg-panel tg-tip tg-flagtip" style={{ display: 'none' }}>
          <b>{flagInfo.value}</b>
          <span className="tg-cap tg-muted">{flagInfo.coords}</span>
        </div>
      )}
      <div className="tg-tools">
        <button className="tg-fab" aria-label="Zoom in" onClick={() => zoom(0.6)}>+</button>
        <button className="tg-fab" aria-label="Zoom out" onClick={() => zoom(1 / 0.6)}>−</button>
      </div>
    </div>
  );
}

/** Black flag as SVG, drawn at 4x its display size so it stays sharp; the pole's foot is the bottom-centre. */
const FLAG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="136" height="176" viewBox="0 0 34 44">' +
  '<ellipse cx="17" cy="42.4" rx="5.5" ry="1.6" fill="#000" opacity=".35"/>' +
  '<rect x="15.8" y="3.5" width="2.4" height="38.5" rx="1.2" fill="#111" stroke="#fff" stroke-width="1"/>' +
  '<circle cx="17" cy="3.6" r="2.6" fill="#111" stroke="#fff" stroke-width="1"/>' +
  '<path d="M18.4 5.5C23.4 2.6 27 8.4 33 5.5V18C27 20.9 23.4 15.1 18.4 18Z" fill="#111" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>');

const deg180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
