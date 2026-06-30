import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth, roleHome } from '../store/auth';
import { fadeInUp, springs } from '../motion';
import logoUrl from '../assets/logo.png';

export function Login() {
  const navigate = useNavigate();
  const signIn = useAuth((s) => s.signIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const role = await signIn(email, password);
      // Route to the area for this role: SUPERADMIN → admin console, others → portal.
      navigate(roleHome(role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center px-4">
      <motion.form
        onSubmit={onSubmit}
        className="card w-full max-w-sm p-6"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springs.gentle}
      >
        <div className="mb-6 text-center">
          <Link to="/" className="inline-block">
            <img src={logoUrl} alt="Increff" className="mx-auto mb-3 h-10 w-auto" />
          </Link>
          <h1 className="text-lg font-semibold text-slate-900">Sign in to Return Genie</h1>
          <p className="text-sm text-slate-500">Use your Return Genie credentials</p>
        </div>

        <AnimatePresence initial={false}>
          {error && (
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-3">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="mb-5">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </motion.form>
    </div>
  );
}
