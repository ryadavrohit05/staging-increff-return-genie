/**
 * System tray + minimize-to-tray (ARCHITECTURE.md §1, §4).
 *
 * Menu: Open, Sync now (focuses the window so the user can start a sync from the
 * dashboard), Quit. Closing the window hides it to the tray rather than quitting,
 * so background heartbeats/updates keep running.
 */
import { app, Menu, Tray, nativeImage, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { createLog } from './services/logger.js';

const log = createLog('tray');

let tray: Tray | null = null;

export function createTray(getWindow: () => BrowserWindow | null, showWindow: () => void): Tray {
  // Packaged → resources/icon.ico; dev → repo resources/icon.png. Fall back to an
  // empty image so the Tray still builds if neither is present.
  let image = nativeImage.createEmpty();
  const candidates = app.isPackaged
    ? [join(process.resourcesPath ?? '', 'icon.ico')]
    : [join(__dirname, '../../resources/icon.png'), join(__dirname, '../../resources/icon.ico')];
  for (const p of candidates) {
    try {
      const loaded = nativeImage.createFromPath(p);
      if (!loaded.isEmpty()) {
        image = loaded;
        break;
      }
    } catch {
      /* try next */
    }
  }

  tray = new Tray(image);
  tray.setToolTip('Return Genie');

  const menu = Menu.buildFromTemplate([
    { label: 'Open Return Genie', click: () => showWindow() },
    {
      label: 'Sync now',
      click: () => {
        showWindow();
        getWindow()?.webContents.send('tray:sync-now');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => showWindow());
  log.info('Tray created');
  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
