import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * Three independent builds:
 *  - main:     Node entry (src/main/index.ts) — privileged process
 *  - preload:  contextBridge surface (src/preload/index.ts)
 *  - renderer: Vite + React SPA rooted at src/renderer
 *
 * Native / Electron-bound deps (keytar, electron-updater, playwright,
 * playwright-extra, @rg/automation) are externalized so they are NOT bundled —
 * they must be required at runtime from node_modules.
 */
const externals = [
  'keytar',
  'electron-updater',
  'playwright',
  'playwright-extra',
  '@rg/automation',
];

export default defineConfig(({ mode }) => {
  // Load the .env file so we can bake values into the main-process bundle.
  // In dev, electron-vite already injects these; in a packaged build
  // process.env is empty, so we must use vite `define` to hard-code them.
  const {
    RG_BACKEND_URL = 'https://return-genie-api.onrender.com',
    RG_SUPABASE_URL = '',
    RG_SUPABASE_ANON_KEY = '',
    RG_DEVICE_SALT = 'return-genie-device-v1',
    RG_SYNC_POLL_MS = '4000',
    RG_UPDATE_CHECK_MS = String(6 * 60 * 60 * 1000),
  } = process.env;

  /** Replace process.env.RG_* calls at bundle time (production exe). */
  const defineEnv = {
    'process.env.RG_BACKEND_URL': JSON.stringify(RG_BACKEND_URL),
    'process.env.RG_SUPABASE_URL': JSON.stringify(RG_SUPABASE_URL),
    'process.env.RG_SUPABASE_ANON_KEY': JSON.stringify(RG_SUPABASE_ANON_KEY),
    'process.env.RG_DEVICE_SALT': JSON.stringify(RG_DEVICE_SALT),
    'process.env.RG_SYNC_POLL_MS': JSON.stringify(RG_SYNC_POLL_MS),
    'process.env.RG_UPDATE_CHECK_MS': JSON.stringify(RG_UPDATE_CHECK_MS),
  };

  return {
    main: {
      plugins: [externalizeDepsPlugin({ exclude: [] })],
      define: defineEnv,
      build: {
        rollupOptions: {
          external: externals,
          input: {
            index: resolve('src/main/index.ts'),
            // utilityProcess.fork target — built as a sibling entry.
            'automation-worker': resolve('src/main/automation-worker.ts'),
          },
        },
      },
    },
    preload: {
      // A sandboxed preload (sandbox: true) runs in a restricted context whose
      // require() resolves only `electron` (+ a few polyfills) — NOT arbitrary
      // node_modules. So it must be fully self-contained: bundle @rg/shared (and
      // its transitive `zod`) instead of externalizing them, or the preload throws
      // "module not found: @rg/shared" at load and window.rg is never exposed.
      plugins: [externalizeDepsPlugin({ exclude: ['@rg/shared', 'zod'] })],
      build: {
        rollupOptions: {
          external: externals,
          input: { index: resolve('src/preload/index.ts') },
          // Sandboxed preload scripts MUST be CommonJS — Electron cannot load an
          // ESM preload when `sandbox: true`. Emit `index.js` (CJS) to match the
          // path referenced in windows.ts (`../preload/index.js`).
          output: {
            format: 'cjs',
            entryFileNames: '[name].js',
          },
        },
      },
    },
    renderer: {
      root: resolve('src/renderer'),
      resolve: {
        alias: {
          '@': resolve('src/renderer'),
        },
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          input: { index: resolve('src/renderer/index.html') },
        },
      },
    },
  };
});
