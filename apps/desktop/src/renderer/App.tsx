/**
 * Root router. Login is public; everything else is behind the Protected guard
 * and rendered inside the Layout shell.
 */
import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/auth';
import { Protected } from './components/Protected';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { Settings } from './pages/Settings';

export function App() {
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Protected>
              <Layout>
                <Dashboard />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/history"
          element={
            <Protected>
              <Layout>
                <History />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected>
              <Layout>
                <Settings />
              </Layout>
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
