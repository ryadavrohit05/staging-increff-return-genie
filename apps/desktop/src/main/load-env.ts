/**
 * Load `apps/desktop/.env` into `process.env` for the MAIN process in dev.
 *
 * config.ts reads `process.env.RG_*`, but electron-vite only injects
 * `MAIN_VITE_*`-prefixed vars into `import.meta.env` — it does NOT populate
 * `process.env` with the RG_* keys. Without this, the main process falls back to
 * the production defaults in config.ts (e.g. the prod backend URL), so local API
 * calls go to the wrong host and fail with "fetch failed".
 *
 * This MUST be the first import in index.ts so the env is populated before
 * config.ts is evaluated. In a packaged build there is no .env on disk — real
 * environment variables are used and config.ts fallbacks apply — so we skip it.
 */
import { app } from 'electron';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

if (!app.isPackaged) {
  // Built entry is out/main/index.js → the .env is two levels up (apps/desktop/.env),
  // resolved from the file location so it works regardless of process.cwd().
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
  dotenv.config({ path: envPath });
}
