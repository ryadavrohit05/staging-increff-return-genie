import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Browser Supabase client used ONLY for SUPERADMIN email/password login and
 * session management. All tenant data access goes through our backend with the
 * resulting JWT as a Bearer token — never directly against Supabase tables.
 *
 * The anon key is public by design; access is enforced by backend SUPERADMIN
 * role checks + Postgres RLS.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'rg-admin-auth',
  },
});
