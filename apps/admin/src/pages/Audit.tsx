import { useState } from 'react';
import { PageHeader, ErrorNotice } from '../components/Layout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { useAudit, type AuditEntry } from '../lib/queries';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function Audit() {
  const [page, setPage] = useState(1);
  const audit = useAudit({ page, pageSize: 30 });

  const columns: Column<AuditEntry>[] = [
    { key: 'ts', header: 'When', render: (a) => fmt(a.ts) },
    {
      key: 'action',
      header: 'Action',
      render: (a) => <span className="font-mono text-xs">{a.action}</span>,
    },
    { key: 'actor', header: 'Actor', render: (a) => a.actorId ?? '—' },
    { key: 'org', header: 'Org', render: (a) => a.orgId ?? '—' },
    { key: 'target', header: 'Target', render: (a) => a.target ?? '—' },
    {
      key: 'meta',
      header: 'Meta',
      render: (a) =>
        a.meta ? (
          <code className="block max-w-xs truncate text-xs text-slate-500" title={JSON.stringify(a.meta)}>
            {JSON.stringify(a.meta)}
          </code>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Audit" description="Every administrative action, newest first." />
      <ErrorNotice error={audit.error} />
      <DataTable
        columns={columns}
        rows={audit.data?.items ?? []}
        rowKey={(a) => a.id}
        isLoading={audit.isLoading}
        emptyMessage="No audit entries."
      />
      {audit.data && (
        <Pagination
          page={audit.data.page}
          pageSize={audit.data.pageSize}
          total={audit.data.total}
          onPageChange={setPage}
        />
      )}
    </>
  );
}
