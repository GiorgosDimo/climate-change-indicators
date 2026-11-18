import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      'timeline-globe/style.css': fileURLToPath(new URL('./packages/timeline-globe/src/style.css', import.meta.url)),
      'timeline-globe': fileURLToPath(new URL('./packages/timeline-globe/src/index.ts', import.meta.url)),
    },
  },
  test: { environment: 'jsdom', setupFiles: ['tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx}', 'packages/*/tests/**/*.test.{ts,tsx}'] },
});
