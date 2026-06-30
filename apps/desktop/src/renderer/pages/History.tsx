/**
 * History page: paginated SyncSummary list; clicking a run opens the
 * ResultsViewer (stat cards + failed rows + retry-failed).
 */
import { useEffect, useState } from 'react';
import type { SyncSummary } from '@rg/shared';
import { ipc, errorMessage } from '../lib/ipc';
import { ResultsViewer } from '../components/ResultsViewer';
import { Spinner } from '../components/icons';

const PAGE_SIZE = 20;

function stateBadge(state: string): string {
  if (state === 'SUCCEEDED') return 'border-success/25 bg-success-light text-success';
  if (state === 'FAILED') return 'border-danger/25 bg-danger-light text-danger';
  if (state === 'CANCELLED') return 'border-slate-200 bg-slate-100 text-ink-muted';
  return 'border-primary/25 bg-primary-light text-primary';
}

export function History() {
  const [items, setItems] = useState<SyncSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SyncSummary | null>(null);

  async function load(p: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await ipc.sync.history(p, PAGE_SIZE);
      setItems(res.items);
      setTotal(res.total);
      setPage(res.page);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (selected) {
    return (
      <div className="rg-card">
        <div className="rg-card-header">
          <div className="rg-card-title">Run {selected.id.slice(0, 8)}</div>
        </div>
        <div className="rg-card-body">
          <ResultsViewer run={selected} onBack={() => setSelected(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="rg-card">
      <div className="rg-card-header">
        <div className="rg-card-title">Sync History</div>
      </div>
      <div className="rg-card-body">
        {error && <div className="rg-error mb-4">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-10 text-ink-muted">
            <Spinner className="text-2xl" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-muted">No sync runs yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[0.7rem] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">Marketplace</th>
                  <th className="px-4 py-2.5">Range</th>
                  <th className="px-4 py-2.5">State</th>
                  <th className="px-4 py-2.5 text-right">Synced</th>
                  <th className="px-4 py-2.5 text-right">Failed</th>
                  <th className="px-4 py-2.5">Started</th>
                </tr>
              </thead>
              <tbody>
                {items.map((run) => (
                  <tr
                    key={run.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => setSelected(run)}
                  >
                    <td className="px-4 py-2.5 font-semibold">{run.marketplace}</td>
                    <td className="px-4 py-2.5 text-ink-secondary">
                      {run.startDate} → {run.endDate}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rg-status-badge ${stateBadge(run.state)}`}>{run.state}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-success">{run.successRows ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-danger">{run.failedRows ?? '—'}</td>
                    <td className="px-4 py-2.5 text-ink-muted">
                      {new Date(run.startedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              className="rg-btn rg-btn-ghost"
              disabled={page <= 1}
              onClick={() => void load(page - 1)}
            >
              Prev
            </button>
            <span className="text-[0.78rem] text-ink-muted">
              Page {page} of {pages}
            </span>
            <button
              className="rg-btn rg-btn-ghost"
              disabled={page >= pages}
              onClick={() => void load(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
