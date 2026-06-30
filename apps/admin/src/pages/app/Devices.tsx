import type { DeviceInfo } from '@rg/shared';
import { PageHeader, ErrorNotice } from '../../components/Layout';
import { DataTable, type Column } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../lib/format';
import { useMyDevices } from '../../lib/clientQueries';

export function Devices() {
  const devices = useMyDevices();

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
    { key: 'heartbeat', header: 'Last heartbeat', render: (d) => formatDateTime(d.lastHeartbeat) },
    { key: 'registered', header: 'Registered', render: (d) => formatDateTime(d.registeredAt) },
  ];

  return (
    <>
      <PageHeader
        title="Devices"
        description="Machines registered to your organization's Return Genie license."
      />
      <ErrorNotice error={devices.error} />
      <DataTable
        columns={columns}
        rows={devices.data?.items ?? []}
        rowKey={(d) => d.id}
        isLoading={devices.isLoading}
        emptyMessage="No devices registered yet. Install Return Genie and sign in to register this machine."
      />
    </>
  );
}
