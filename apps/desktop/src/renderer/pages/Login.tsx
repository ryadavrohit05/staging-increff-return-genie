/**
 * Login page — email/password against the backend (proxied through main). The
 * password is masked; tokens are stored in the main process, never here.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { MaskedInput } from '../components/MaskedInput';
import { Spinner, Alert } from '../components/icons';
import logoUrl from '../assets/logo.png';

export function Login() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch {
      /* error surfaced via store */
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="rg-card w-full max-w-md animate-slideUp">
        <div className="rg-card-body">
          <div className="mb-6 text-center">
            <img src={logoUrl} alt="Increff" className="mx-auto h-10 w-auto" />
            <h1 className="mt-4 text-lg font-extrabold text-primary">Return Genie</h1>
            <p className="mt-1 text-sm text-ink-secondary">Sign in to your workspace</p>
          </div>

          {error && (
            <div className="rg-error mb-4">
              <Alert /> {error}
            </div>
          )}

          <form onSubmit={onSubmit}>
            <div className="mb-5">
              <label className="rg-label">Email</label>
              <input
                type="email"
                className="rg-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoFocus
                required
              />
            </div>
            <div className="mb-6">
              <label className="rg-label">Password</label>
              <MaskedInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              className="rg-btn rg-btn-primary w-full justify-center"
              disabled={loading}
            >
              {loading ? <Spinner /> : null} Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
