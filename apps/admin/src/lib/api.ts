import { supabase } from './supabase';
import { env } from './env';

/**
 * Normalized API error. The backend returns `{ code, message, details }` for
 * AppError (see @rg/shared codes.ts); we surface those fields plus HTTP status.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(status: number, code: string | undefined, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, 'RG-AUTH-003', 'Not signed in.');
  return { Authorization: `Bearer ${token}` };
}

type Query = Record<string, string | number | boolean | undefined | null>;

function toSearch(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
}

/** All admin endpoints live under /api/v1/admin (see backend index.ts). */
async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = opts;
  const headers: Record<string, string> = { ...(await authHeader()) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${env.backendUrl}/api/v1${path}${toSearch(query)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw new ApiError(0, 'RG-NET-001', 'Could not reach the backend.', cause);
  }

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const err = (payload ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(
      res.status,
      err.code,
      err.message || `Request failed with ${res.status}`,
      err.details,
    );
  }

  return payload as T;
}

/**
 * Multipart/form-data POST. Used for the admin installer upload (the .exe file
 * plus text fields). We do NOT set Content-Type — the browser sets it with the
 * correct multipart boundary. Auth + error normalization match `request()`.
 */
async function postForm<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeader()) };

  let res: Response;
  try {
    res = await fetch(`${env.backendUrl}/api/v1${path}`, {
      method: 'POST',
      headers,
      body: form,
    });
  } catch (cause) {
    throw new ApiError(0, 'RG-NET-001', 'Could not reach the backend.', cause);
  }

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const err = (payload ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(
      res.status,
      err.code,
      err.message || `Request failed with ${res.status}`,
      err.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  postForm,
};
