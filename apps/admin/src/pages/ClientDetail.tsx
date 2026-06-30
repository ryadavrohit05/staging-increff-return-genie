import { type ReactNode } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import type { OrgSummary, DeviceInfo } from '@rg/shared';
import { PageHeader, ErrorNotice } from '../components/Layout';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { Stagger, StaggerItem, useToast } from '../components/motion';
import { springs } from '../motion';
import { useOrgs, useOrgDevices, useRevokeDevice } from '../lib/queries';

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

export function ClientDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  const fromState = (location.state as { org?: OrgSummary } | null)?.org;

  // The backend has no single-org detail endpoint; reuse the list (cached) when
  // we didn't arrive via router state (e.g. on hard refresh / deep link).
  const orgsQuery = useOrgs({ page: 1, pageSize: 100 });
  const org: OrgSummary | undefined =
    fromState ?? orgsQuery.data?.items.find((o) => o.id === id);

  const devices = useOrgDevices(id);
  const revoke = useRevokeDevice();
  const toast = useToast();

  const onRevoke = (d: DeviceInfo) =>
    revoke.mutate(d.id, {
      onSuccess: () => toast.success('Device revoked', d.hostname),
      onError: (e) => toast.error('Revoke failed', e instanceof Error ? e.message : undefined),
    });

  const columns: Column<DeviceInfo>[] = [
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
    { key: 'appVersion', header: 'App version', render: (d) => d.appVersion },
    { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
    { key: 'heartbeat', header: 'Last heartbeat', render: (d) => fmt(d.lastHeartbeat) },
    { key: 'registered', header: 'Registered', render: (d) => fmt(d.registeredAt) },
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
        title={org?.name ?? 'Client'}
        description={org ? `${org.slug} · ${id}` : id}
      />
      <Link to="/admin/clients" className="mb-4 inline-block text-sm text-brand-600 hover:text-brand-700">
        ← Back to clients
      </Link>

      <ErrorNotice error={orgsQuery.error ?? devices.error ?? revoke.error} />

      {org && (
        <Stagger className="mb-6 grid grid-cols-3 gap-4">
          <Stat label="Status" value={<StatusBadge status={org.status} />} />
          <Stat label="Devices" value={`${org.deviceCount} / ${org.maxDevices}`} />
          <Stat label="Users" value={org.userCount} />
        </Stagger>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Devices</h2>
      <DataTable
        columns={columns}
        rows={devices.data?.items ?? []}
        rowKey={(d) => d.id}
        isLoading={devices.isLoading}
        emptyMessage="No devices registered for this org."
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <StaggerItem
      className="card px-4 py-3 transition-shadow hover:shadow-md"
      whileHover={{ y: -2, transition: springs.snappy }}
    >
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </StaggerItem>
  );
}

