import { useState, type FormEvent, type ReactNode } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import type { OrgSummary, DeviceInfo, AutomationMode, ExternalApiConfigInput } from '@rg/shared';
import { PageHeader, ErrorNotice } from '../components/Layout';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { Stagger, StaggerItem, useToast } from '../components/motion';
import { springs } from '../motion';
import {
  useOrgs,
  useOrgDevices,
  useRevokeDevice,
  useExternalApiConfig,
  useUpsertExternalApiConfig,
} from '../lib/queries';

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

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Tenant configuration
      </h2>
      <TenantConfig orgId={id} />

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Devices</h2>
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

interface ConfigForm {
  clientSlug: string;
  cimsClientId: string;
  webgetDbId: string;
  automationMode: AutomationMode;
  authUsername: string;
  authPassword: string;
  returnOrdersPath: string;
}

/**
 * Per-org CIMS / Webget / automation configuration. Shows the current config
 * (password masked) and lets a super-admin edit it. Editing without a new
 * password keeps the existing one.
 */
function TenantConfig({ orgId }: { orgId: string }) {
  const cfgQuery = useExternalApiConfig(orgId);
  const upsert = useUpsertExternalApiConfig(orgId);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ConfigForm | null>(null);

  const config = cfgQuery.data?.config ?? null;

  const startEdit = () => {
    setForm({
      clientSlug: config?.clientSlug ?? '',
      cimsClientId: config ? String(config.cimsClientId) : '',
      webgetDbId: config ? String(config.webgetDbId) : '',
      automationMode: config?.automationMode ?? 'MANUAL_LOGIN',
      authUsername: config?.authUsername ?? '',
      authPassword: '',
      returnOrdersPath: config?.returnOrdersPath ?? '/cims/import/returnOrders',
    });
    setEditing(true);
  };

  const setField = <K extends keyof ConfigForm>(k: K, v: ConfigForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const payload: ExternalApiConfigInput = {
      clientSlug: form.clientSlug,
      cimsClientId: Number(form.cimsClientId),
      webgetDbId: Number(form.webgetDbId),
      automationMode: form.automationMode,
      returnOrdersPath: form.returnOrdersPath || '/cims/import/returnOrders',
      ...(form.authUsername.trim() ? { authUsername: form.authUsername.trim() } : {}),
      ...(form.authPassword ? { authPassword: form.authPassword } : {}),
    };
    try {
      await upsert.mutateAsync(payload);
      toast.success('Configuration saved');
      setEditing(false);
    } catch (err) {
      toast.error('Save failed', err instanceof Error ? err.message : undefined);
    }
  };

  if (cfgQuery.isLoading) {
    return <div className="card px-4 py-3 text-sm text-slate-400">Loading configuration…</div>;
  }

  if (editing && form) {
    return (
      <form onSubmit={onSubmit} className="card space-y-3 px-4 py-4">
        <div>
          <label className="label">CIMS domain / client slug</label>
          <input
            className="input"
            value={form.clientSlug}
            onChange={(e) => setField('clientSlug', e.target.value.toLowerCase())}
            pattern="[a-z0-9-]+"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">CIMS clientId</label>
            <input
              type="number"
              min={1}
              className="input"
              value={form.cimsClientId}
              onChange={(e) => setField('cimsClientId', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Webget dbId</label>
            <input
              type="number"
              min={1}
              className="input"
              value={form.webgetDbId}
              onChange={(e) => setField('webgetDbId', e.target.value)}
              required
            />
          </div>
        </div>
        <div>
          <label className="label">Automation mode</label>
          <select
            className="input"
            value={form.automationMode}
            onChange={(e) => setField('automationMode', e.target.value as AutomationMode)}
          >
            <option value="MANUAL_LOGIN">Manual login (user signs in)</option>
            <option value="AUTO_LOGIN">Auto login (stored credentials)</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">CIMS username (optional)</label>
            <input
              className="input"
              value={form.authUsername}
              onChange={(e) => setField('authUsername', e.target.value)}
              placeholder="shared default"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">CIMS password</label>
            <input
              type="password"
              className="input"
              value={form.authPassword}
              onChange={(e) => setField('authPassword', e.target.value)}
              placeholder={config?.passwordSet ? '•••••• (unchanged)' : 'shared default'}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div>
          <label className="label">Return orders path</label>
          <input
            className="input"
            value={form.returnOrdersPath}
            onChange={(e) => setField('returnOrdersPath', e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={upsert.isPending}>
            {upsert.isPending ? 'Saving…' : 'Save configuration'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="card px-4 py-4">
      {config ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <ConfigRow label="Client slug" value={config.clientSlug} />
          <ConfigRow label="Automation mode" value={config.automationMode} />
          <ConfigRow label="CIMS clientId" value={String(config.cimsClientId)} />
          <ConfigRow label="Webget dbId" value={String(config.webgetDbId)} />
          <ConfigRow label="Base URL" value={config.baseUrl} />
          <ConfigRow label="Auth domain" value={config.authDomainName} />
          <ConfigRow label="Auth username" value={config.authUsername} />
          <ConfigRow label="Password" value={config.passwordSet ? 'Set (encrypted)' : 'Shared default'} />
        </dl>
      ) : (
        <p className="text-sm text-slate-500">
          No CIMS configuration for this organization yet.
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn-secondary" onClick={startEdit}>
          {config ? 'Edit configuration' : 'Add configuration'}
        </button>
      </div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-900 break-all">{value}</dd>
    </div>
  );
}

