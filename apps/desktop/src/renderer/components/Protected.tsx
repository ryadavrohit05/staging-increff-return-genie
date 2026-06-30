/**
 * Route guard: redirects to /login when there is no authenticated session.
 * Waits for auth bootstrap before deciding.
 */
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Spinner } from './icons';

export function Protected({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-ink-muted">
        <Spinner className="text-2xl" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
