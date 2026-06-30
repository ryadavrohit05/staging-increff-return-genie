/**
 * Ambient declaration of the preload bridge so the renderer gets a fully typed
 * `window.rg` without importing any Electron/preload code.
 */
import type { RgApi } from './index';

declare global {
  interface Window {
    rg: RgApi;
  }
}

export {};
