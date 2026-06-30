/**
 * Failure result panel, ported from the reference. Shows the error icon, the
 * error code + message, the tail of error log lines, and a retry button.
 */
import type { LogLine } from '../store/sync';
import { Alert, Retry } from './icons';

interface Props {
  code: string;
  message: string;
  logs: LogLine[];
  onRetry: () => void;
}

export function FailurePanel({ code, message, logs, onRetry }: Props) {
  const errorLines = logs.filter((l) => l.level === 'ERROR').slice(-20);
  return (
    <div className="py-10 text-center animate-slideUp">
      <div
        className="rg-result-icon animate-bounceIn"
        style={{ background: 'linear-gradient(135deg,#ef4444,#b91c1c)', boxShadow: '0 0 32px rgba(239,68,68,0.35)' }}
      >
        <Alert />
      </div>
      <h2 className="mb-2 text-xl font-extrabold">Sync Failed</h2>
      <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-danger">
        {code}
      </p>
      <p className="mx-auto mb-6 max-w-lg text-sm text-ink-secondary">
        {message || 'An unexpected error occurred. Check the console logs.'}
      </p>

      {errorLines.length > 0 && (
        <div className="rg-terminal mx-auto mb-6 max-w-2xl text-left">
          <div className="rg-terminal-bar">
            <span className="font-mono text-[0.7rem] text-[#484f58]">error output</span>
          </div>
          <div className="rg-terminal-body !h-44">
            {errorLines.map((l, i) => (
              <p key={i} className="rg-log text-terminal-err">
                ! {l.message}
              </p>
            ))}
          </div>
        </div>
      )}

      <button className="rg-btn rg-btn-primary" onClick={onRetry}>
        <Retry /> Try Again
      </button>
    </div>
  );
}
