'use client';

import { useEffect, useRef } from 'react';
import { decode, loadColormap, loadFrame, type Colormap } from '@/lib/frames';
import { recolorBitmap, type Palette } from '@/lib/palette';
import type { BBox } from '@/lib/indicators';

// Cesium loaded via CDN <Script> in layout.tsx
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Cesium: any;
  }
}

export interface Hover {
  x: number; y: number; lat: number; lon: number; value: string;
  num: number | null;        // the value as a number (null = no data)
  cell: [number, number];    // centre of the image pixel that was read: the exact spot shown by the flag
  src: string;               // URL of the frame the value comes from
}

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
  onValues: (on: boolean) => void;
  marker: [number, number] | null; // lat, lon of the flag
}

const MIN_DIST = 3e6;        // ~tile level 4: closest zoom
const MAX_DIST = 4e7;
const DETAIL_BELOW = 9e6;    // fetch a sharper image of the visible area below this camera height
const FADE = 0.01;           // not 0: Cesium skips layers at alpha 0, so they would never load

export default function GlobeView({ src, detailUrl, colormap, format, alpha, palette, north, onHover, values, onValues, marker }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
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
  const latest = useRef({ alpha, format, detailUrl, onHover, palette, colormap, values });
  latest.current = { alpha, format, detailUrl, onHover, palette, colormap, values };
  const paletteKey = `${palette.id}${palette.low}${palette.high}`;
  const api = useRef({
    scheduleDetail: () => {}, clearDetail: () => {}, settle: async () => {},
    display: async (f: { url: string; blob: Blob }) => f.url,
    refresh: () => {},
  });

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !window.Cesium) return;
    const C = window.Cesium;
    C.Ion.defaultAccessToken = '';
    // Render only on change (not 60 fps), no animation widgets, no default Ion imagery.
    const v = new C.Viewer(el, {
      baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
      requestRenderMode: true, maximumRenderTimeChange: Infinity,
    });
    viewer.current = v;
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
    api.current = { scheduleDetail, clearDetail, settle, display, refresh: () => lastPick.current && emit(lastPick.current) };
    v.camera.moveStart.addEventListener(() => { clearDetail(); lastPick.current = null; latest.current.onHover(null); });
    v.camera.moveEnd.addEventListener(scheduleDetail);

    // Value under a fixed spot. Re-run on every new frame so the number follows the animation.
    const emit = (at: { x: number; y: number; lat: number; lon: number }) => {
      const b = bmp.current, cm = cmap.current;
      if (!b || !cm || cmName.current !== bmpCmName.current) return; // image and legend must be the same layer
      const px = Math.min(b.width - 1, Math.floor(((at.lon + 180) / 360) * b.width));
      const py = Math.min(b.height - 1, Math.floor(((90 - at.lat) / 180) * b.height));
      const ctx = new OffscreenCanvas(1, 1).getContext('2d')!;
      ctx.drawImage(b, px, py, 1, 1, 0, 0, 1, 1);
      const [r, g, bl, a] = ctx.getImageData(0, 0, 1, 1).data;
      const val = a < 128 ? null : decode(cm, r, g, bl);
      latest.current.onHover({
        ...at, value: val === null ? 'No data' : latest.current.format(val, cm.units), num: val, src: bmpSrc.current,
        cell: [90 - ((py + 0.5) / b.height) * 180, -180 + ((px + 0.5) / b.width) * 360],
      });
    };
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
    h.setInputAction((m: { position: { x: number; y: number } }) => pick(m.position), C.ScreenSpaceEventType.LEFT_CLICK);

    return () => { clearTimeout(timer); v.destroy(); viewer.current = null; layer.current = null; detail.current = null; flag.current = null; };
  }, []);

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
  }, [src, paletteKey]);

  useEffect(() => {
    if (!viewer.current || viewer.current.isDestroyed()) return;
    const target = detail.current ? FADE : alpha;
    if (layer.current) layer.current.alpha = target;
    if (detail.current) detail.current.alpha = alpha;
    viewer.current.scene.requestRender();
  }, [alpha]);

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

  // Flag on the pixel being read.
  useEffect(() => {
    const v = viewer.current, C = window.Cesium;
    if (!v || v.isDestroyed()) return;
    if (!marker) { if (flag.current) flag.current.show = false; } else {
      const position = C.Cartesian3.fromDegrees(marker[1], marker[0]);
      if (flag.current) { flag.current.position = position; flag.current.show = true; } else {
        flag.current = v.entities.add({ position, billboard: { image: flagIcon(), verticalOrigin: C.VerticalOrigin.BOTTOM } });
      }
    }
    v.scene.requestRender();
  }, [marker?.[0], marker?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [north]);

  const zoom = (factor: number) => {
    const v = viewer.current;
    if (!v) return;
    const h = v.camera.positionCartographic.height;
    const t = Math.min(MAX_DIST, Math.max(MIN_DIST, h * factor));
    if (t < h) v.camera.zoomIn(h - t); else v.camera.zoomOut(t - h);
  };

  return (
    <div className="globe">
      <div ref={boxRef} className={`globe-view${values ? '' : ' grab'}`} onMouseLeave={() => { lastPick.current = null; onHover(null); }} />
      <div className="tools">
        <button className="fab" aria-label="Show values" aria-pressed={values} title="Show values on hover or tap" onClick={() => onValues(!values)}>
          <svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm-1-6v3.1A7 7 0 005.1 11H2v2h3.1A7 7 0 0011 18.9V22h2v-3.1a7 7 0 005.9-5.9H22v-2h-3.1A7 7 0 0013 5.1V2h-2zm1 5a5 5 0 110 10 5 5 0 010-10z" /></svg>
        </button>
        <button className="fab" aria-label="Zoom in" onClick={() => zoom(0.6)}>+</button>
        <button className="fab" aria-label="Zoom out" onClick={() => zoom(1 / 0.6)}>−</button>
      </div>
    </div>
  );
}

/** Small red flag; the pole's foot is the bottom-centre of the image. */
function flagIcon() {
  const c = document.createElement('canvas');
  c.width = 28; c.height = 36;
  const g = c.getContext('2d')!;
  g.lineWidth = 3; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(14, 4); g.lineTo(14, 35); g.stroke();
  g.fillStyle = '#e53935'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(15, 3); g.lineTo(27, 9); g.lineTo(15, 16); g.closePath(); g.fill(); g.stroke();
  return c;
}

const deg180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
