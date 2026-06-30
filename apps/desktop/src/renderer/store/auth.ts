/**
 * Auth store. Holds ONLY the non-secret SessionUser — tokens live in the main
 * process. `bootstrap()` is called once at app start; `onState` keeps it in sync
 * with main-process pushes (login/logout/refresh-failure).
 */
import { create } from 'zustand';
import type { SessionUser } from '@rg/shared';
import { ipc, errorMessage } from '../lib/ipc';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  ready: boolean; // bootstrap finished
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => {
  // Subscribe once to main-process auth-state pushes.
  ipc.auth.onState(({ user }) => set({ user }));

  return {
    user: null,
    loading: false,
    ready: false,
    error: null,

    bootstrap: async () => {
      try {
        const user = await ipc.auth.me();
        set({ user, ready: true });
      } catch {
        set({ user: null, ready: true });
      }
    },

    login: async (email, password) => {
      set({ loading: true, error: null });
      try {
        const user = await ipc.auth.login(email, password);
        set({ user, loading: false });
      } catch (err) {
        set({ loading: false, error: errorMessage(err) });
        throw err;
      }
    },

    logout: async () => {
      await ipc.auth.logout();
      set({ user: null });
    },
  };
});
