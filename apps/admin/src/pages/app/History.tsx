import { useState } from 'react';
import type { SyncSummary } from '@rg/shared';
import { PageHeader, ErrorNotice } from '../../components/Layout';
import { DataTable, type Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../lib/format';
import { useMySyncRuns, useSyncRunResults } from '../../lib/clientQueries';

const PAGE_SIZE = 20;

export function History() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SyncSummary | null>(null);

  const runs = useMySyncRuns({ page, pageSize: PAGE_SIZE });

  const columns: Column<SyncSummary>[] = [
    { key: 'marketplace', header: 'Marketplace', render: (r) => r.marketplace },
    {
      key: 'range',
      header: 'Date range',
      render: (r) => (
        <span className="text-xs">
          {r.startDate} → {r.endDate}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (r) => (
        <div>
          <StatusBadge status={r.state} />
          {r.phase && <div className="mt-1 text-xs text-slate-400">{r.phase}</div>}
        </div>
      ),
    },
    {
      key: 'rows',
      header: 'Rows (S/F/Sk)',
      render: (r) =>
        r.totalRows == null ? (
          '—'
        ) : (
          <span className="text-xs">
            <span className="text-emerald-600">{r.successRows ?? 0}</span> /{' '}
            <span className="text-red-600">{r.failedRows ?? 0}</span> /{' '}
            <span className="text-amber-600">{r.skippedRows ?? 0}</span>
          </span>
        ),
    },
    { key: 'started', header: 'Started', render: (r) => formatDateTime(r.startedAt) },
  ];

  return (
    <>
      <PageHeader
        title="Sync History"
        description="Every reconciliation run from your devices. Click a row for per-order results."
      />
      <ErrorNotice error={runs.error} />
      <DataTable
        columns={columns}
        rows={runs.data?.items ?? []}
        rowKey={(r) => r.id}
        isLoading={runs.isLoading}
        onRowClick={(r) => setSelected(r)}
        emptyMessage="No sync runs yet."
      />
      {runs.data && (
        <Pagination
          page={runs.data.page}
          pageSize={runs.data.pageSize}
          total={runs.data.total}
          onPageChange={setPage}
        />
      )}

      <SyncRunDetailModal run={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function SyncRunDetailModal({ run, onClose }: { run: SyncSummary | null; onClose: () => void }) {
  const results = useSyncRunResults(run?.id);
  const rows = results.data?.items ?? [];

  return (
    <Modal open={Boolean(run)} title="Sync run" onClose={onClose}>
      {run && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={run.state} />
            <span className="text-slate-500">
              {run.marketplace} · {run.startDate} → {run.endDate}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md bg-emerald-50 py-2">
              <div className="text-lg font-semibold text-emerald-700">{run.successRows ?? 0}</div>
              <div className="text-xs text-emerald-600">Success</div>
            </div>
            <div className="rounded-md bg-red-50 py-2">
              <div className="text-lg font-semibold text-red-700">{run.failedRows ?? 0}</div>
              <div className="text-xs text-red-600">Failed</div>
            </div>
            <div className="rounded-md bg-amber-50 py-2">
              <div className="text-lg font-semibold text-amber-700">{run.skippedRows ?? 0}</div>
              <div className="text-xs text-amber-600">Skipped</div>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Started {formatDateTime(run.startedAt)}
            {run.finishedAt && <> · finished {formatDateTime(run.finishedAt)}</>}
          </div>

          {run.errorCode && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              <strong>{run.errorCode}</strong>
              {run.errorMessage ? ` — ${run.errorMessage}` : ''}
            </div>
          )}

          <div>
            <h3 className="mb-1 font-semibold text-slate-700">
              Results{results.data ? ` (${rows.length})` : ''}
            </h3>
            {results.isLoading && <p className="text-xs text-slate-500">Loading results…</p>}
            {results.error && (
              <p className="text-xs text-red-600">
                {results.error instanceof Error ? results.error.message : 'Failed to load results.'}
              </p>
            )}
            {results.data && (
              <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Order</th>
                      <th className="px-3 py-1.5 text-left">Status</th>
                      <th className="px-3 py-1.5 text-left">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-center text-slate-400">
                          No per-row results.
                        </td>
                      </tr>
                    )}
                    {rows.map((r, i) => (
                      <tr key={`${r.orderId}-${i}`}>
                        <td className="px-3 py-1.5 font-mono">{r.orderId}</td>
                        <td className="px-3 py-1.5">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-3 py-1.5 text-red-600">{r.error ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
