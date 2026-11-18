import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['react', 'geotiff'],
  // every component is a client component (it uses state, effects and the browser's WebGL)
  banner: { js: "'use client';" },
});
