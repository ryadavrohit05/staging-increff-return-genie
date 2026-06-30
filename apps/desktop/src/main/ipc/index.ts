/**
 * IPC registration aggregator. Called once from main/index.ts after the window
 * is created.
 */
import type { BrowserWindow } from 'electron';
import { registerAuthIpc } from './auth.ipc.js';
import { registerCredsIpc } from './creds.ipc.js';
import { registerSyncIpc } from './sync.ipc.js';
import { registerAppIpc } from './app.ipc.js';

export function registerAllIpc(getWindow: () => BrowserWindow | null): void {
  registerAuthIpc(getWindow);
  registerCredsIpc();
  registerSyncIpc(getWindow);
  registerAppIpc();
}
