/**
 * Auth IPC handlers (ARCHITECTURE.md §6).
 *
 * Login proxies to the backend, persists tokens in the encrypted token-store
 * (main only), and returns ONLY the SessionUser to the renderer. Tokens never
 * cross the bridge.
 */
import type { BrowserWindow } from 'electron';
import {
  CH,
  LoginInput,
  type LoginResult,
  type SessionUser,
} from '@rg/shared';
import { handle } from './helpers.js';
import { apiClient } from '../services/api-client.js';
import { saveTokens, clearTokens, loadTokens } from '../services/token-store.js';
import { registerDevice } from '../services/device.js';
import { validate } from '../services/license-gate.js';
import { createLog } from '../services/logger.js';

const log = createLog('auth.ipc');

/** Push auth state to the renderer (login/logout/refresh). */
export function pushAuthState(win: BrowserWindow | null, user: SessionUser | null): void {
  if (win && !win.isDestroyed()) win.webContents.send(CH.AUTH_STATE, { user });
}

export function registerAuthIpc(getWindow: () => BrowserWindow | null): void {
  handle(CH.AUTH_LOGIN, LoginInput, async (input): Promise<SessionUser> => {
    const result = await apiClient.post<LoginResult>('/auth/login', input, true);
    await saveTokens(result.tokens);
    pushAuthState(getWindow(), result.user);
    log.info('User logged in', { userId: result.user.id, orgId: result.user.orgId });

    // Now that a session exists, register this device + validate the license so
    // the user can sync immediately. These also run at launch, but fail there
    // pre-login ("No active device registered" would otherwise block the first
    // sync of a fresh session). Best-effort: a failure here must not fail login.
    try {
      await registerDevice();
    } catch (err) {
      log.warn('Post-login device registration failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    void validate().catch(() => undefined);

    return result.user;
  });

  handle(CH.AUTH_LOGOUT, null, async (): Promise<{ ok: true }> => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      /* best-effort server-side revoke */
    }
    await clearTokens();
    pushAuthState(getWindow(), null);
    log.info('User logged out');
    return { ok: true };
  });

  handle(CH.AUTH_ME, null, async (): Promise<SessionUser | null> => {
    const tokens = await loadTokens();
    if (!tokens) return null;
    try {
      return await apiClient.get<SessionUser>('/auth/me');
    } catch {
      return null;
    }
  });
}
