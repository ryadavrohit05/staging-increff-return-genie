/**
 * Typed IPC channel registry.
 *
 * Every channel name is declared here once and imported by BOTH the preload
 * bridge and the main-process handlers, so a typo can never silently create an
 * unhandled channel. Payload/return types live in ../contracts and ../types.
 */
export const CH = {
  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_ME: 'auth:me',
  AUTH_STATE: 'auth:state', // main -> renderer push (login/logout/refresh)

  // Marketplace credentials (local keystore)
  CREDS_SAVE: 'creds:save',
  CREDS_STATUS: 'creds:status',
  CREDS_LIST: 'creds:list',
  CREDS_CLEAR: 'creds:clear',

  // Sync
  SYNC_START: 'sync:start',
  SYNC_CANCEL: 'sync:cancel',
  SYNC_EVENT: 'sync:event', // main -> renderer push (live log/state events)
  SYNC_HISTORY: 'sync:history',
  SYNC_RESULTS: 'sync:results',
  SYNC_RETRY_FAILED: 'sync:retry-failed',
  SYNC_DOWNLOAD_RESULTS: 'sync:download-results',

  // License & device
  LICENSE_STATUS: 'license:status',
  DEVICE_INFO: 'device:info',

  // App / updates
  APP_VERSION: 'app:version',
  APP_ORG_CONFIG: 'app:org-config', // non-secret per-org runtime config (automation mode)
  APP_UPDATE: 'app:update', // main -> renderer push (update available/progress/ready)
  APP_INSTALL_UPDATE: 'app:install-update',
  APP_OPEN_EXTERNAL: 'app:open-external',
} as const;

export type IpcChannel = (typeof CH)[keyof typeof CH];

/** Standard envelope for invoke() results so the renderer never throws raw. */
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
