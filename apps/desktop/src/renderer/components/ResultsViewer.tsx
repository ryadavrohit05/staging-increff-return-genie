/**
 * Results viewer for a single sync run: stat cards + a failed-rows table +
 * "retry failed" button. Used by the History page when a run is selected.
 */
import { useEffect, useState } from 'react';
import type { SyncSummary, SyncResultRow } from '@rg/shared';
import { ipc, errorMessage } from '../lib/ipc';
import { StatCards } from './StatCards';
import { Retry, Spinner } from './icons';

interface Props {
  run: SyncSummary;
  onBack: () => void;
}

export function ResultsViewer({ run, onBack }: Props) {
  const [rows, setRows] = useState<SyncResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await ipc.sync.results(run.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);

  const failed = rows.filter((r) => r.status === 'FAILED');

  async function retryFailed() {
    setRetrying(true);
    try {
      await ipc.sync.retryFailed(run.id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="animate-fadeIn">
      <button className="rg-btn rg-btn-ghost mb-4" onClick={onBack}>
        ← Back to history
      </button>

      <div className="mb-6">
        <StatCards
          total={run.totalRows ?? 0}
          success={run.successRows ?? 0}
          failed={run.failedRows ?? 0}
          skipped={run.skippedRows ?? 0}
        />
      </div>

      {error && <div className="rg-error mb-4 justify-center">{error}</div>}

      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[0.82rem] font-bold uppercase tracking-[0.06em] text-ink-secondary">
          Failed Rows ({failed.length})
        </h3>
        {failed.length > 0 && (
          <button className="rg-btn rg-btn-primary" onClick={retryFailed} disabled={retrying}>
            {retrying ? <Spinner /> : <Retry />} Retry Failed
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-ink-muted">
          <Spinner className="text-2xl" />
        </div>
      ) : failed.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">No failed rows. 🎉</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[0.72rem] uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2.5">Order ID</th>
                <th className="px-4 py-2.5">Error</th>
              </tr>
            </thead>
            <tbody>
              {failed.map((r, i) => (
                <tr key={`${r.orderId}-${i}`} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-mono text-[0.78rem]">{r.orderId}</td>
                  <td className="px-4 py-2.5 text-danger">{r.error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
