import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth, roleHome } from './store/auth';
import { MotionProvider } from './motion';
import { ToastProvider } from './components/motion';
import { Layout } from './components/Layout';
import { AppLayout } from './components/AppLayout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
// Admin pages (SUPERADMIN)
import { Clients } from './pages/Clients';
import { ClientDetail } from './pages/ClientDetail';
import { Devices } from './pages/Devices';
import { SyncMonitoring } from './pages/SyncMonitoring';
import { Versions } from './pages/Versions';
import { Audit } from './pages/Audit';
// Client portal pages (OWNER / ADMIN / MEMBER)
import { Download } from './pages/app/Download';
import { License } from './pages/app/License';
import { Devices as MyDevices } from './pages/app/Devices';
import { History } from './pages/app/History';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function FullScreenLoader() {
  return <div className="flex h-full items-center justify-center text-slate-400">Loading…</div>;
}

/**
 * Gate for the SUPERADMIN admin console. Redirects unauthenticated users to
 * /login and sends authenticated non-superadmins to their own area so each role
 * only ever sees its own portal.
 */
function AdminGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { session, role, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role !== 'SUPERADMIN') return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/**
 * Gate for the client portal (any provisioned role). Redirects unauthenticated
 * users to /login and bounces a SUPERADMIN to the admin console.
 */
function AppGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { session, role, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role === 'SUPERADMIN') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

/**
 * Public-only routes (landing, login). An already-authenticated user is sent to
 * their role home instead of seeing the marketing/login pages.
 */
function PublicOnly({ children }: { children: ReactNode }) {
  const { session, role, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (session) return <Navigate to={roleHome(role)} replace />;
  return <>{children}</>;
}

export function App() {
  const init = useAuth((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route
                path="/"
                element={
                  <PublicOnly>
                    <Landing />
                  </PublicOnly>
                }
              />
              <Route
                path="/login"
                element={
                  <PublicOnly>
                    <Login />
                  </PublicOnly>
                }
              />

              {/* Client portal (OWNER / ADMIN / MEMBER) */}
              <Route
                path="/app"
                element={
                  <AppGuard>
                    <AppLayout />
                  </AppGuard>
                }
              >
                <Route index element={<Download />} />
                <Route path="license" element={<License />} />
                <Route path="devices" element={<MyDevices />} />
                <Route path="history" element={<History />} />
                <Route path="*" element={<Navigate to="/app" replace />} />
              </Route>

              {/* Admin console (SUPERADMIN) */}
              <Route
                path="/admin"
                element={
                  <AdminGuard>
                    <Layout />
                  </AdminGuard>
                }
              >
                <Route index element={<Navigate to="/admin/clients" replace />} />
                <Route path="clients" element={<Clients />} />
                <Route path="clients/:id" element={<ClientDetail />} />
                <Route path="devices" element={<Devices />} />
                <Route path="sync" element={<SyncMonitoring />} />
                <Route path="versions" element={<Versions />} />
                <Route path="audit" element={<Audit />} />
                <Route path="*" element={<Navigate to="/admin/clients" replace />} />
              </Route>

              {/* Unknown → landing (which itself redirects authed users home). */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </MotionProvider>
    </QueryClientProvider>
  );
}
