/**
 * Auto-update wiring (ARCHITECTURE.md §16).
 *
 * electron-updater checks the GitHub Releases feed on launch and on an interval.
 * Update lifecycle events are pushed to the renderer over CH.APP_UPDATE so the
 * Settings → Updates tab can show available/progress/downloaded state and offer
 * an install button (CH.APP_INSTALL_UPDATE → quitAndInstall).
 */
import type { WebContents } from 'electron';
import { CH } from '@rg/shared';
import { config } from '../config.js';
import { createLog } from './logger.js';

const log = createLog('updater');

export interface UpdateEvent {
  status: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

let timer: NodeJS.Timeout | null = null;
let target: WebContents | null = null;

function push(event: UpdateEvent): void {
  if (target && !target.isDestroyed()) target.send(CH.APP_UPDATE, event);
}

/** electron-updater is a native/runtime dep — load lazily so dev (no feed) is fine. */
async function getAutoUpdater() {
  try {
    const mod = await import('electron-updater');
    return mod.autoUpdater;
  } catch {
    return null;
  }
}

export async function initUpdater(webContents: WebContents): Promise<void> {
  target = webContents;
  const autoUpdater = await getAutoUpdater();
  if (!autoUpdater) {
    log.warn('electron-updater unavailable; auto-update disabled');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => push({ status: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    push({ status: 'available', version: info.version }),
  );
  autoUpdater.on('update-not-available', () => push({ status: 'not-available' }));
  autoUpdater.on('download-progress', (p) =>
    push({ status: 'progress', percent: Math.round(p.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    push({ status: 'downloaded', version: info.version }),
  );
  autoUpdater.on('error', (err) =>
    push({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
  );

  const check = (): void => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.warn('Update check failed', { err: err instanceof Error ? err.message : String(err) });
    });
  };

  check();
  timer = setInterval(check, config.updateCheckIntervalMs);
}

export async function installUpdate(): Promise<void> {
  const autoUpdater = await getAutoUpdater();
  autoUpdater?.quitAndInstall();
}

export function stopUpdater(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
