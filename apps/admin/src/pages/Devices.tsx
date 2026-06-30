import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { DeviceInfo, OrgSummary } from '@rg/shared';
import { PageHeader, ErrorNotice } from '../components/Layout';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/motion';
import { useOrgs, useRevokeDevice, qk } from '../lib/queries';
import { api } from '../lib/api';

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

type Row = DeviceInfo & { orgId: string; orgName: string };

/**
 * Cross-org device tracking. The backend exposes devices per-org
 * (GET /admin/orgs/:id/devices), so we fan out across all orgs and flatten.
 * Org count is small (90+) and paged here at 100, which is sufficient; if the
 * tenant count grows, add a dedicated cross-tenant devices endpoint.
 */
export function Devices() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'REVOKED'>('ALL');
  const toast = useToast();
  const orgs = useOrgs({ page: 1, pageSize: 100 });
  const revoke = useRevokeDevice();
  const orgList: OrgSummary[] = orgs.data?.items ?? [];

  const onRevoke = (d: Row) =>
    revoke.mutate(d.id, {
      onSuccess: () => toast.success('Device revoked', `${d.hostname} · ${d.orgName}`),
      onError: (e) => toast.error('Revoke failed', e instanceof Error ? e.message : undefined),
    });

  const deviceQueries = useQueries({
    queries: orgList.map((o) => ({
      queryKey: qk.orgDevices(o.id),
      queryFn: () => api.get<{ items: DeviceInfo[] }>(`/admin/orgs/${o.id}/devices`),
    })),
  });

  const rows: Row[] = useMemo(() => {
    const all: Row[] = [];
    deviceQueries.forEach((q, i) => {
      const org = orgList[i];
      if (!org || !q.data) return;
      for (const d of q.data.items) {
        all.push({ ...d, orgId: org.id, orgName: org.name });
      }
    });
    const filtered =
      statusFilter === 'ALL' ? all : all.filter((d) => d.status === statusFilter);
    return filtered.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  }, [deviceQueries, orgList, statusFilter]);

  const loading = orgs.isLoading || deviceQueries.some((q) => q.isLoading);

  const columns: Column<Row>[] = [
    { key: 'org', header: 'Client', render: (d) => d.orgName },
    {
      key: 'hostname',
      header: 'Device',
      render: (d) => (
        <div>
          <div className="font-medium text-slate-900">{d.hostname}</div>
          <div className="text-xs text-slate-400">{d.os}</div>
        </div>
      ),
    },
    { key: 'appVersion', header: 'Version', render: (d) => d.appVersion },
    { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
    { key: 'heartbeat', header: 'Last heartbeat', render: (d) => fmt(d.lastHeartbeat) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (d) =>
        d.status === 'ACTIVE' ? (
          <button
            type="button"
            className="text-xs font-medium text-red-600 hover:text-red-700"
            onClick={() => onRevoke(d)}
          >
            Revoke
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Devices"
        description="All registered devices across tenants."
        actions={
          <select
            className="input w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="REVOKED">Revoked</option>
          </select>
        }
      />
      <ErrorNotice error={orgs.error ?? revoke.error} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        isLoading={loading}
        emptyMessage="No devices found."
      />
    </>
  );
}
