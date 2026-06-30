/**
 * App shell: glass topbar with brand, live clock, agent/license badges, nav
 * links, and a logout button. Ported visual language from the reference topbar.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useSync } from '../store/sync';
import { Logout } from './icons';
import logoUrl from '../assets/logo.png';

function Clock() {
  const [t, setT] = useState('');
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setT(
        `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(
          n.getSeconds(),
        ).padStart(2, '0')}`,
      );
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);
  return <span className="font-mono text-[0.72rem] font-semibold text-ink-muted">{t}</span>;
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-sm text-[0.74rem] font-bold uppercase tracking-[0.05em] transition ${
    isActive ? 'bg-primary-light text-primary' : 'text-ink-secondary hover:text-ink-primary'
  }`;

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const running = useSync((s) => s.running);

  return (
    <div className="flex min-h-full flex-col">
      <nav className="rg-topbar">
        <div className="mx-auto flex h-[60px] max-w-[1180px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Increff" className="h-6 w-auto" />
            <span className="h-5 w-px bg-slate-200" />
            <span className="text-[0.8rem] font-extrabold text-primary">Return Genie</span>
            <span className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-secondary">
              Reconciliation
            </span>
          </div>

          <div className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/history" className={navClass}>
              History
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              Settings
            </NavLink>
          </div>

          <div className="flex items-center gap-3">
            <Clock />
            <span
              className={`rg-status-badge ${
                running
                  ? 'border-primary/25 bg-primary-light text-primary'
                  : 'border-success/25 bg-success-light text-success'
              }`}
            >
              <span className={`rg-status-dot ${running ? 'pulse' : ''}`} />
              {running ? 'Running' : 'Ready'}
            </span>
            {user && (
              <button
                onClick={() => void logout()}
                title={user.email}
                className="rg-btn rg-btn-ghost !px-3 !py-1.5"
              >
                <Logout />
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[760px] flex-1 px-6 pb-16 pt-10">{children}</main>
    </div>
  );
}
