import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Role } from '@rg/shared';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  /** True until the initial getSession() resolves, so we don't flash a redirect. */
  loading: boolean;
  /** Role pulled from JWT app_metadata (set by the backend at provisioning). */
  role: Role | null;
  /** Convenience flag for SUPERADMIN gating. */
  isSuperAdmin: boolean;
  init: () => Promise<void>;
  /** Signs in and returns the resolved role so the caller can redirect. */
  signIn: (email: string, password: string) => Promise<Role>;
  signOut: () => Promise<void>;
}

function roleOf(session: Session | null): Role | null {
  // Supabase puts custom claims in app_metadata (set by the backend at provisioning).
  const raw = (session?.user?.app_metadata as { role?: string } | undefined)?.role;
  if (raw === 'SUPERADMIN' || raw === 'OWNER' || raw === 'ADMIN' || raw === 'MEMBER') {
    return raw;
  }
  return null;
}

/** Home route for a given role: SUPERADMIN → admin console, everyone else → client portal. */
export function roleHome(role: Role | null): string {
  return role === 'SUPERADMIN' ? '/admin' : '/app';
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  loading: true,
  role: null,
  isSuperAdmin: false,

  init: async () => {
    const { data } = await supabase.auth.getSession();
    const role = roleOf(data.session);
    set({
      session: data.session,
      role,
      isSuperAdmin: role === 'SUPERADMIN',
      loading: false,
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      const nextRole = roleOf(session);
      set({ session, role: nextRole, isSuperAdmin: nextRole === 'SUPERADMIN' });
    });
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const role = roleOf(data.session);
    if (!role) {
      // No recognized role claim — the account isn't provisioned for the portal.
      await supabase.auth.signOut();
      throw new Error('Your account is not provisioned for Return Genie. Contact your administrator.');
    }
    set({ session: data.session, role, isSuperAdmin: role === 'SUPERADMIN' });
    return role;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, role: null, isSuperAdmin: false });
  },
}));
