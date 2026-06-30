/**
 * Preload bridge (ARCHITECTURE.md §4, §14).
 *
 * Exposes a NARROW, typed surface as `window.rg`. `ipcRenderer` is never leaked.
 * Every method maps to a `CH` channel constant. Push channels (auth state, sync
 * events, update events) expose subscribe helpers that return an unsubscribe fn.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  CH,
  type IpcResult,
  type SessionUser,
  type LoginInput,
  type CredentialInput,
  type CredentialStatus,
  type Marketplace,
  type SyncStartInput,
  type SyncEvent,
  type SyncSummary,
  type SyncResultRow,
  type LicenseStatusResult,
  type DeviceInfo,
} from '@rg/shared';

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface UpdateEvent {
  status: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

type Unsubscribe = () => void;

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

const api = {
  auth: {
    login: (p: LoginInput): Promise<IpcResult<SessionUser>> =>
      ipcRenderer.invoke(CH.AUTH_LOGIN, p),
    logout: (): Promise<IpcResult<{ ok: true }>> => ipcRenderer.invoke(CH.AUTH_LOGOUT),
    me: (): Promise<IpcResult<SessionUser | null>> => ipcRenderer.invoke(CH.AUTH_ME),
    onState: (cb: (s: { user: SessionUser | null }) => void): Unsubscribe =>
      subscribe(CH.AUTH_STATE, cb),
  },
  creds: {
    save: (p: CredentialInput): Promise<IpcResult<{ ok: true }>> =>
      ipcRenderer.invoke(CH.CREDS_SAVE, p),
    status: (marketplace: Marketplace): Promise<IpcResult<CredentialStatus>> =>
      ipcRenderer.invoke(CH.CREDS_STATUS, { marketplace }),
    list: (): Promise<IpcResult<CredentialStatus[]>> => ipcRenderer.invoke(CH.CREDS_LIST),
    clear: (marketplace: Marketplace): Promise<IpcResult<{ ok: true }>> =>
      ipcRenderer.invoke(CH.CREDS_CLEAR, { marketplace }),
  },
  sync: {
    start: (p: SyncStartInput): Promise<IpcResult<{ syncRunId: string }>> =>
      ipcRenderer.invoke(CH.SYNC_START, p),
    cancel: (syncRunId: string): Promise<IpcResult<{ ok: true }>> =>
      ipcRenderer.invoke(CH.SYNC_CANCEL, { syncRunId }),
    onEvent: (cb: (e: SyncEvent) => void): Unsubscribe => subscribe(CH.SYNC_EVENT, cb),
    history: (page?: number, pageSize?: number): Promise<IpcResult<Paginated<SyncSummary>>> =>
      ipcRenderer.invoke(CH.SYNC_HISTORY, { page, pageSize }),
    results: (syncRunId: string): Promise<IpcResult<SyncResultRow[]>> =>
      ipcRenderer.invoke(CH.SYNC_RESULTS, { syncRunId }),
    retryFailed: (syncRunId: string): Promise<IpcResult<{ ok: true }>> =>
      ipcRenderer.invoke(CH.SYNC_RETRY_FAILED, { syncRunId }),
    /** Download the detailed results CSV to the OS Downloads folder. */
    downloadResults: (syncRunId: string): Promise<IpcResult<{ path: string }>> =>
      ipcRenderer.invoke(CH.SYNC_DOWNLOAD_RESULTS, { syncRunId }),
  },
  license: {
    status: (): Promise<IpcResult<LicenseStatusResult>> => ipcRenderer.invoke(CH.LICENSE_STATUS),
  },
  device: {
    info: (): Promise<IpcResult<DeviceInfo>> => ipcRenderer.invoke(CH.DEVICE_INFO),
  },
  app: {
    version: (): Promise<IpcResult<string>> => ipcRenderer.invoke(CH.APP_VERSION),
    onUpdate: (cb: (e: UpdateEvent) => void): Unsubscribe => subscribe(CH.APP_UPDATE, cb),
    installUpdate: (): Promise<IpcResult<{ ok: true }>> =>
      ipcRenderer.invoke(CH.APP_INSTALL_UPDATE),
    openExternal: (url: string): Promise<IpcResult<{ ok: true }>> =>
      ipcRenderer.invoke(CH.APP_OPEN_EXTERNAL, { url }),
    /** Fired when the user picks "Sync now" from the tray or a deep link. */
    onSyncNow: (cb: () => void): Unsubscribe => subscribe('tray:sync-now', cb),
  },
} as const;

export type RgApi = typeof api;

contextBridge.exposeInMainWorld('rg', api);
