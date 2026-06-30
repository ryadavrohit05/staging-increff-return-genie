/**
 * Main process entry (ARCHITECTURE.md §4, §14).
 *
 * Responsibilities:
 *   - single-instance lock,
 *   - register the `returngenie://` custom protocol (parsed/validated safely),
 *   - create the secure window,
 *   - wire all IPC handlers,
 *   - init updater + tray,
 *   - on launch: register device + validate license + start heartbeat.
 */
// MUST be first: populates process.env.RG_* from apps/desktop/.env before any
// module that reads config (config.ts) is evaluated. See load-env.ts.
import './load-env.js';
import { app, BrowserWindow } from 'electron';
import { config } from './config.js';
import { createMainWindow } from './windows.js';
import { createTray, destroyTray } from './tray.js';
import { registerAllIpc } from './ipc/index.js';
import { initUpdater, stopUpdater } from './services/updater.js';
import { registerDevice, startHeartbeat, stopHeartbeat } from './services/device.js';
import { validate } from './services/license-gate.js';
import { setAuthLostHandler } from './services/api-client.js';
import { shutdownAutomation } from './services/automation-host.js';
import { pushAuthState } from './ipc/auth.ipc.js';
import { loadTokens } from './services/token-store.js';
import { createLog } from './services/logger.js';

const log = createLog('main');

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

const getWindow = (): BrowserWindow | null => mainWindow;

function showWindow(): void {
  if (!mainWindow) {
    mainWindow = createMainWindow();
    wireWindow(mainWindow);
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

/** Minimize-to-tray: hide on close unless we are really quitting. */
function wireWindow(win: BrowserWindow): void {
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

/** Parse a returngenie:// deep link safely (e.g. returngenie://start). */
function handleDeepLink(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'returngenie:') return;
    log.info('Deep link', { host: parsed.hostname });
    showWindow();
    // The renderer decides what "start" means; we just surface it.
    mainWindow?.webContents.send('tray:sync-now');
  } catch {
    log.warn('Ignored malformed deep link');
  }
}

/** Initialize backend-facing state after the window exists. */
async function bootstrapBackend(): Promise<void> {
  // If we have a persisted session, tell the renderer immediately (it confirms
  // via auth:me). If refresh fails later, setAuthLostHandler pushes a logout.
  const tokens = await loadTokens();
  if (!tokens) pushAuthState(mainWindow, null);

  await registerDevice();
  try {
    await validate();
  } catch (err) {
    log.warn('Initial license validation failed (grace window may apply)', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
  startHeartbeat();
}

function main(): void {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  // Register custom protocol (best-effort in dev).
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('returngenie', process.execPath, [process.argv[1]!]);
  } else {
    app.setAsDefaultProtocolClient('returngenie');
  }

  app.on('second-instance', (_e, argv) => {
    showWindow();
    const deepLink = argv.find((a) => a.startsWith('returngenie://'));
    if (deepLink) handleDeepLink(deepLink);
  });

  // macOS deep-link path (harmless on Windows).
  app.on('open-url', (_e, url) => handleDeepLink(url));

  app.whenReady().then(async () => {
    // Kick the (possibly sleeping free-tier) backend awake immediately, so the
    // first auth/license call isn't waiting on a ~50s cold start. Fire-and-forget.
    void fetch(`${config.backendUrl}/health`).catch(() => {});

    setAuthLostHandler(() => pushAuthState(mainWindow, null));

    mainWindow = createMainWindow();
    wireWindow(mainWindow);

    registerAllIpc(getWindow);
    createTray(getWindow, showWindow);

    mainWindow.webContents.once('did-finish-load', () => {
      if (mainWindow) void initUpdater(mainWindow.webContents);
    });

    await bootstrapBackend();

    // Windows: a deep link may be in argv on first launch.
    const deepLink = process.argv.find((a) => a.startsWith('returngenie://'));
    if (deepLink) handleDeepLink(deepLink);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) showWindow();
  });

  // Keep running in the tray when all windows are closed (Windows/Linux).
  app.on('window-all-closed', () => {
    /* intentional no-op: app lives in the tray until Quit */
  });

  app.on('before-quit', () => {
    isQuitting = true;
    stopHeartbeat();
    stopUpdater();
    shutdownAutomation();
    destroyTray();
  });
}

main();
