import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { springs, staggerContainer } from '../motion';
import { StaggerItem, PageTransition } from './motion';
import logoUrl from '../assets/logo.png';

const NAV = [
  { to: '/app', label: 'Download', end: true },
  { to: '/app/license', label: 'License', end: false },
  { to: '/app/devices', label: 'Devices', end: false },
  { to: '/app/history', label: 'Sync History', end: false },
];

/**
 * Persistent shell for the client portal (OWNER / ADMIN / MEMBER). Structurally
 * mirrors the admin <Layout> — sidebar never remounts on navigation, so the
 * active-nav indicator glides via a shared `layoutId` and only the content area
 * cross-fades through <PageTransition>.
 */
export function AppLayout() {
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
          <div className="mt-2 text-xs font-medium text-slate-400">Return Genie</div>
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
                end={item.end}
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
                        layoutId="app-nav-active"
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
        <div className="mx-auto max-w-5xl px-6 py-6">
          <PageTransition />
        </div>
      </main>
    </div>
  );
}
