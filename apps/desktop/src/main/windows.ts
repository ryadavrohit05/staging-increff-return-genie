/**
 * Secure BrowserWindow factory (ARCHITECTURE.md §4, §14).
 *
 *  - contextIsolation: true, nodeIntegration: false, sandbox: true
 *  - preload bridge is the only renderer ↔ main surface
 *  - strict CSP attached via session.webRequest (no remote code)
 *  - setWindowOpenHandler → deny (no popups)
 *  - will-navigate blocked (no in-app navigation away)
 */
import { app, BrowserWindow, session, shell } from 'electron';
import { join } from 'node:path';
import { config } from './config.js';
import { createLog } from './services/logger.js';

const log = createLog('windows');

const isDev = !app.isPackaged;

/** Build the Content-Security-Policy header value from configured origins. */
function cspHeader(): string {
  const ws = config.supabaseUrl.replace(/^https:/, 'wss:');
  const connect = ["'self'", config.backendUrl, config.supabaseUrl, ws]
    .filter(Boolean)
    .join(' ');
  // In dev, electron-vite serves the renderer over http with HMR (ws) — relax
  // script/connect to allow the dev server. Packaged builds get the strict CSP.
  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      `connect-src 'self' ws: http: ${connect}`,
      "img-src 'self' data:",
      "font-src 'self' data:",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join('; ');
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connect}`,
    "img-src 'self' data:",
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Attach the CSP header to every response in the default session. */
function attachCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspHeader()],
      },
    });
  });
}

export function createMainWindow(): BrowserWindow {
  attachCsp();

  // Window icon: packaged → resources/icon.ico; dev → repo resources/icon.png.
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.ico')
    : join(__dirname, '../../resources/icon.png');

  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  win.once('ready-to-show', () => win.show());

  // Harden navigation: deny popups, block in-app navigation away from our app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // External links open in the OS browser via the explicit openExternal IPC,
    // not here — any window.open is denied outright.
    log.warn('Blocked window.open', { url });
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (e, url) => {
    const devServer = process.env['ELECTRON_RENDERER_URL'];
    if (devServer && url.startsWith(devServer)) return; // allow HMR navigations
    e.preventDefault();
    log.warn('Blocked will-navigate', { url });
  });

  // Load renderer: dev server URL when developing, bundled index.html otherwise.
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (devServer) {
    void win.loadURL(devServer);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

/** Open an external URL in the OS default browser (used by the app IPC). */
export async function openExternal(url: string): Promise<void> {
  // Only allow http(s) — never file:// or custom schemes from the renderer.
  if (!/^https?:\/\//i.test(url)) {
    log.warn('Refused to open non-http external URL', { url });
    return;
  }
  await shell.openExternal(url);
}
