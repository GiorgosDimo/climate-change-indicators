// CesiumJS is loaded from a CDN on first use, so the package needs no Cesium dependency and no bundler setup
// for Cesium's workers and assets. Pass `cesiumUrl` to the component to self-host it instead.
export const CESIUM_URL = 'https://cesium.com/downloads/cesiumjs/releases/1.122/Build/Cesium';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Cesium: any;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loading = new Map<string, Promise<any>>();

/** Resolves with the global `Cesium` once its script (and widget CSS) have loaded. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadCesium(base: string = CESIUM_URL): Promise<any> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  let p = loading.get(base);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `${base}/Widgets/widgets.css`;
      const js = document.createElement('script');
      js.src = `${base}/Cesium.js`;
      js.onload = () => resolve(window.Cesium);
      js.onerror = () => { loading.delete(base); js.remove(); reject(new Error(`Could not load Cesium from ${base}`)); };
      document.head.append(css, js);
    });
    loading.set(base, p);
  }
  return p;
}
