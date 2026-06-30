/** Typed, validated access to the VITE_* environment. Fails fast in dev. */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy apps/admin/.env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  backendUrl: required('VITE_BACKEND_URL', import.meta.env.VITE_BACKEND_URL).replace(/\/$/, ''),
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
} as const;
