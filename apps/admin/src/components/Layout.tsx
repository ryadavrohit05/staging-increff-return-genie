import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { fadeInUp, springs, staggerContainer } from '../motion';
import { StaggerItem, PageTransition } from './motion';
import logoUrl from '../assets/logo.png';

const NAV = [
  { to: '/admin/clients', label: 'Clients' },
  { to: '/admin/devices', label: 'Devices' },
  { to: '/admin/sync', label: 'Sync Monitoring' },
  { to: '/admin/versions', label: 'Versions' },
  { to: '/admin/audit', label: 'Audit' },
];

/**
 * Persistent application shell. Mounted once by the layout route, so the sidebar
 * never remounts on navigation — which lets the active-nav indicator glide
 * between items via a shared `layoutId`, and lets <PageTransition> cross-fade
 * only the content area.
 */
export function Layout() {
  const navigate = useNavigate();
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);

  const onSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full">
      <motion.aside
        className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white"
        initial={{ x: -12, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={springs.gentle}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <img src={logoUrl} alt="Increff" className="h-7 w-auto" />
          <div className="mt-2 text-xs font-medium text-slate-400">Return Genie · Admin</div>
        </div>
        <motion.nav
          className="flex-1 space-y-1 px-3 py-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {NAV.map((item) => (
            <StaggerItem key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `relative block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-brand-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-md bg-brand-50"
                        transition={springs.snappy}
                      />
                    )}
                    <span className="relative">{item.label}</span>
                  </>
                )}
              </NavLink>
            </StaggerItem>
          ))}
        </motion.nav>
        <div className="border-t border-slate-200 px-5 py-3">
          <div className="truncate text-xs text-slate-500" title={session?.user?.email ?? ''}>
            {session?.user?.email}
          </div>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </motion.aside>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <PageTransition />
        </div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

/** Inline error banner that eases in/out as the error appears or clears. */
export function ErrorNotice({ error }: { error: unknown }) {
  const message = error ? (error instanceof Error ? error.message : String(error)) : null;
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
          role="alert"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
