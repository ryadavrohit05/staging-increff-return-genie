import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env.js';

/**
 * Two Supabase clients (ARCHITECTURE.md §6, §13):
 *
 *  - `supabaseAnon`    — the public anon key. Used to proxy the password grant
 *                        (auth.service.ts) and, when given a user's bearer token,
 *                        to verify/look up that user (`auth.getUser`).
 *
 *  - `supabaseAdmin`   — the SERVICE ROLE key. Bypasses RLS. Used for Storage
 *                        (signed URLs, uploads) and Supabase Auth admin
 *                        (createUser with app_metadata). SECRET — never returned
 *                        to clients, never logged.
 *
 * Node 22 has native WebSocket support, so @supabase/realtime-js picks it up
 * automatically — no explicit transport configuration needed.
 */
const baseOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
} as const;

export const supabaseAnon: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  baseOptions,
);

export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  baseOptions,
);
