/**
 * Thin, typed wrappers over `window.rg` that unwrap the IpcResult envelope —
 * returning the data on success, or throwing an AppError on failure.
 *
 * The renderer ONLY talks to the main process through this module + `window.rg`.
 * It never imports node/electron/keytar/playwright.
 */
import { AppError, type ErrorCode, type IpcResult } from '@rg/shared';

function unwrap<T>(res: IpcResult<T>): T {
  if (res.ok) return res.data;
  throw new AppError(res.error.code as ErrorCode, res.error.message, res.error.details);
}

const rg = (): Window['rg'] => window.rg;

export const ipc = {
  auth: {
    login: async (email: string, password: string) =>
      unwrap(await rg().auth.login({ email, password })),
    logout: async () => unwrap(await rg().auth.logout()),
    me: async () => unwrap(await rg().auth.me()),
    onState: (cb: Parameters<Window['rg']['auth']['onState']>[0]) => rg().auth.onState(cb),
  },
  creds: {
    save: async (input: Parameters<Window['rg']['creds']['save']>[0]) =>
      unwrap(await rg().creds.save(input)),
    status: async (marketplace: Parameters<Window['rg']['creds']['status']>[0]) =>
      unwrap(await rg().creds.status(marketplace)),
    list: async () => unwrap(await rg().creds.list()),
    clear: async (marketplace: Parameters<Window['rg']['creds']['clear']>[0]) =>
      unwrap(await rg().creds.clear(marketplace)),
  },
  sync: {
    start: async (input: Parameters<Window['rg']['sync']['start']>[0]) =>
      unwrap(await rg().sync.start(input)),
    cancel: async (syncRunId: string) => unwrap(await rg().sync.cancel(syncRunId)),
    onEvent: (cb: Parameters<Window['rg']['sync']['onEvent']>[0]) => rg().sync.onEvent(cb),
    history: async (page?: number, pageSize?: number) =>
      unwrap(await rg().sync.history(page, pageSize)),
    results: async (syncRunId: string) => unwrap(await rg().sync.results(syncRunId)),
    retryFailed: async (syncRunId: string) => unwrap(await rg().sync.retryFailed(syncRunId)),
    downloadResults: async (syncRunId: string) => unwrap(await rg().sync.downloadResults(syncRunId)),
  },
  license: {
    status: async () => unwrap(await rg().license.status()),
  },
  device: {
    info: async () => unwrap(await rg().device.info()),
  },
  app: {
    version: async () => unwrap(await rg().app.version()),
    orgConfig: async () => unwrap(await rg().app.orgConfig()),
    onUpdate: (cb: Parameters<Window['rg']['app']['onUpdate']>[0]) => rg().app.onUpdate(cb),
    installUpdate: async () => unwrap(await rg().app.installUpdate()),
    openExternal: async (url: string) => unwrap(await rg().app.openExternal(url)),
    onSyncNow: (cb: () => void) => rg().app.onSyncNow(cb),
  },
};

/** Helper for UI: turn any thrown error into a user-safe message string. */
export function errorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
