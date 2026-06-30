/**
 * Backend REST client (ARCHITECTURE.md §6, §8).
 *
 *  - Prefixes BACKEND_URL/api/v1.
 *  - Attaches `Authorization: Bearer <access>` from the encrypted token store.
 *  - On 401, performs a SINGLE-FLIGHT refresh and retries once.
 *  - Maps `{ error: { code, message } }` bodies to AppError.
 *  - Retries transient network failures with exponential backoff.
 *
 * Tokens never leave the main process.
 */
import { AppError, ErrorCode, type AuthTokens } from '@rg/shared';
import { API_BASE } from '../config.js';
import { loadTokens, peekTokens, saveTokens, clearTokens } from './token-store.js';
import { createLog } from './logger.js';

const log = createLog('api-client');

type AuthStateListener = (loggedIn: boolean) => void;
let onAuthLost: AuthStateListener | null = null;
export function setAuthLostHandler(fn: AuthStateListener): void {
  onAuthLost = fn;
}

let refreshInFlight: Promise<AuthTokens | null> | null = null;

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Skip Authorization header (login/refresh). */
  anonymous?: boolean;
  /** FormData for multipart upload; if set, body is ignored. */
  form?: FormData;
  /** Retry budget for transient network errors. */
  retries?: number;
  /** Per-request timeout (ms). Prevents a stalled request from hanging forever. */
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function parseError(res: Response): Promise<AppError> {
  let code: string = ErrorCode.INTERNAL;
  let message = `HTTP ${res.status}`;
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string } };
    if (data?.error?.code) code = data.error.code;
    if (data?.error?.message) message = data.error.message;
  } catch {
    /* non-JSON body */
  }
  if (res.status === 401 && code === ErrorCode.INTERNAL) code = ErrorCode.AUTH_TOKEN_EXPIRED;
  return new AppError(code as ErrorCode, message, { status: res.status });
}

async function doRefresh(): Promise<AuthTokens | null> {
  const current = peekTokens() ?? (await loadTokens());
  if (!current?.refreshToken) return null;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  });
  if (!res.ok) {
    log.warn('Refresh failed; clearing session', { status: res.status });
    await clearTokens();
    onAuthLost?.(false);
    return null;
  }
  const tokens = (await res.json()) as AuthTokens;
  await saveTokens(tokens);
  return tokens;
}

/** Single-flight refresh: concurrent 401s share one network round-trip. */
async function refreshTokens(): Promise<AuthTokens | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function send<T>(path: string, opts: RequestOptions, isRetry = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (!opts.form) headers['Content-Type'] = 'application/json';

  if (!opts.anonymous) {
    const tokens = peekTokens() ?? (await loadTokens());
    if (tokens?.accessToken) headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }

  const retries = opts.retries ?? 1;
  // 60s default tolerates a free-tier backend cold start (~50s) so the first
  // request succeeds instead of timing out early and retrying against a server
  // that is still waking. Uploads get the long timeout set in postForm.
  const timeoutMs = opts.timeoutMs ?? (opts.form ? 120_000 : 60_000);
  let lastNetErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Per-attempt timeout so a stalled connection fails fast instead of hanging.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
        signal: controller.signal,
      });

      if (res.status === 401 && !opts.anonymous && !isRetry) {
        const refreshed = await refreshTokens();
        if (refreshed) return send<T>(path, opts, true);
        throw new AppError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Session expired. Please sign in again.');
      }

      if (!res.ok) throw await parseError(res);

      if (res.status === 204) return undefined as T;
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (err) {
      // AppError = a real HTTP/business failure — do not retry.
      if (err instanceof AppError) throw err;
      // Otherwise it's a network-level failure (incl. timeout abort): retry.
      lastNetErr = err instanceof Error && err.name === 'AbortError'
        ? new Error(`Request timed out after ${timeoutMs}ms`)
        : err;
      if (attempt < retries) await sleep(300 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  log.error('Network request failed after retries', { path });
  throw new AppError(
    ErrorCode.NETWORK_ERROR,
    lastNetErr instanceof Error ? lastNetErr.message : 'Network error',
  );
}

export const apiClient = {
  get: <T>(path: string) => send<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, anonymous = false) =>
    send<T>(path, { method: 'POST', body, anonymous }),
  /** Multipart upload (report). Auth header attached automatically. */
  postForm: <T>(path: string, form: FormData) =>
    send<T>(path, { method: 'POST', form, retries: 1, timeoutMs: 120_000 }),
};
