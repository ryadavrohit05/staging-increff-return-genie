import { useState } from 'react';
import type { SyncSummary } from '@rg/shared';
import { PageHeader, ErrorNotice } from '../components/Layout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { useOrgs, useSyncRuns, useSyncRun, type SyncRunFilters } from '../lib/queries';

const SYNC_STATES = [
  'QUEUED',
  'RUNNING',
  'DOWNLOADING',
  'PROCESSING',
  'UPLOADING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
];

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

export function SyncMonitoring() {
  const [filters, setFilters] = useState<SyncRunFilters>({ page: 1, pageSize: 20 });
  const [openId, setOpenId] = useState<string | null>(null);

  const orgs = useOrgs({ page: 1, pageSize: 100 });
  const runs = useSyncRuns(filters);

  const setFilter = (patch: Partial<SyncRunFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

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
    {
      key: 'error',
      header: 'Error',
      render: (r) =>
        r.errorCode ? <span className="text-xs text-red-600">{r.errorCode}</span> : '—',
    },
    { key: 'started', header: 'Started', render: (r) => fmt(r.startedAt) },
  ];

  return (
    <>
      <PageHeader
        title="Sync Monitoring"
        description="Cross-tenant sync runs. Click a row for logs, results, and failure screenshots."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          className="input w-56"
          value={filters.orgId ?? ''}
          onChange={(e) => setFilter({ orgId: e.target.value || undefined })}
        >
          <option value="">All clients</option>
          {orgs.data?.items.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          className="input w-44"
          value={filters.state ?? ''}
          onChange={(e) => setFilter({ state: e.target.value || undefined })}
        >
          <option value="">All states</option>
          {SYNC_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="input w-44"
          value={filters.marketplace ?? ''}
          onChange={(e) => setFilter({ marketplace: e.target.value || undefined })}
        >
          <option value="">All marketplaces</option>
          <option value="MYNTRA">MYNTRA</option>
          <option value="FLIPKART">FLIPKART</option>
        </select>
      </div>

      <ErrorNotice error={runs.error} />
      <DataTable
        columns={columns}
        rows={runs.data?.items ?? []}
        rowKey={(r) => r.id}
        isLoading={runs.isLoading}
        onRowClick={(r) => setOpenId(r.id)}
        emptyMessage="No sync runs match these filters."
      />
      {runs.data && (
        <Pagination
          page={runs.data.page}
          pageSize={runs.data.pageSize}
          total={runs.data.total}
          onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
        />
      )}

      <SyncRunDetailModal id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function SyncRunDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useSyncRun(id ?? undefined);
  const d = detail.data;

  return (
    <Modal open={Boolean(id)} title="Sync run" onClose={onClose}>
      {detail.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {detail.error && (
        <p className="text-sm text-red-600">
          {detail.error instanceof Error ? detail.error.message : 'Failed to load run.'}
        </p>
      )}
      {d && (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3">
            <StatusBadge status={d.run.state} />
            <span className="text-slate-500">
              {d.run.marketplace} · {d.run.startDate} → {d.run.endDate}
            </span>
          </div>

          {d.run.errorCode && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              <strong>{d.run.errorCode}</strong> — {d.run.errorMessage}
            </div>
          )}

          {d.screenshotUrl && (
            <a
              href={d.screenshotUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-brand-600 hover:text-brand-700"
            >
              View failure screenshot ↗ (signed URL, expires shortly)
            </a>
          )}

          <div>
            <h3 className="mb-1 font-semibold text-slate-700">Logs</h3>
            <div className="max-h-48 overflow-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">
              {d.logs.length === 0 && <div className="text-slate-500">No logs.</div>}
              {d.logs.map((l, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  <span className="text-slate-500">{new Date(l.ts).toLocaleTimeString()} </span>
                  <span
                    className={
                      l.level === 'ERROR'
                        ? 'text-red-400'
                        : l.level === 'WARN'
                          ? 'text-amber-300'
                          : 'text-emerald-300'
                    }
                  >
                    [{l.level}]
                  </span>{' '}
                  <span className="text-slate-400">{l.stage}</span> {l.message}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-1 font-semibold text-slate-700">Results ({d.results.length})</h3>
            <div className="max-h-48 overflow-auto rounded-md border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Order</th>
                    <th className="px-3 py-1.5 text-left">Status</th>
                    <th className="px-3 py-1.5 text-left">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.results.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-3 text-center text-slate-400">
                        No per-row results.
                      </td>
                    </tr>
                  )}
                  {d.results.map((r, i) => (
                    <tr key={i}>
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
          </div>
        </div>
      )}
    </Modal>
  );
}
