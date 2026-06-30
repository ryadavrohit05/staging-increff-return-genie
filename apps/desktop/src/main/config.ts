/**
 * Centralized runtime configuration for the main process.
 *
 * Values are baked in at build time via vite `define` (electron.vite.config.ts).
 * process.env.RG_* are replaced with literal strings during compilation, so the
 * packaged exe carries the correct URLs regardless of the runtime environment.
 */

export const config = {
  /** Backend REST base (without the /api/v1 suffix). */
  backendUrl: (process.env.RG_BACKEND_URL ?? '').trim() || 'https://return-genie-api.onrender.com',
  /** Supabase project URL (used for CSP connect-src + Realtime). */
  supabaseUrl: (process.env.RG_SUPABASE_URL ?? '').trim() || 'https://ekswwevjbcxqyqmnaynu.supabase.co',
  /** Public anon key (safe to ship; RLS enforces tenancy). */
  supabaseAnonKey: (process.env.RG_SUPABASE_ANON_KEY ?? '').trim(),
  /** Salt mixed into the device fingerprint hash (NOT a secret per se). */
  deviceSalt: (process.env.RG_DEVICE_SALT ?? '').trim() || 'return-genie-device-v1',
  /** Polling interval (ms) for backend sync-run processing status. */
  syncPollIntervalMs: Number((process.env.RG_SYNC_POLL_MS ?? '').trim() || '4000'),
  /** Auto-update check interval (ms). */
  updateCheckIntervalMs: Number((process.env.RG_UPDATE_CHECK_MS ?? '').trim() || String(6 * 60 * 60 * 1000)),
} as const;


/** Full API base including the versioned path segment. */
export const API_BASE = `${config.backendUrl}/api/v1`;
