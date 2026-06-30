import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreateOrgInput, OrgSummary, OrgStatus, AutomationMode, CimsPlatform } from '@rg/shared';
import { PageHeader, ErrorNotice } from '../components/Layout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/motion';
import { useOrgs, useCreateOrg, useUpdateOrgStatus } from '../lib/queries';

const PAGE_SIZE = 20;

export function Clients() {
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const orgs = useOrgs({ page, pageSize: PAGE_SIZE });
  const updateStatus = useUpdateOrgStatus();

  const onToggleStatus = (org: OrgSummary, status: OrgStatus) => {
    updateStatus.mutate(
      { id: org.id, status },
      {
        onSuccess: () => toast.success(`${org.name} ${status.toLowerCase()}`),
        onError: (e) => toast.error('Update failed', e instanceof Error ? e.message : undefined),
      },
    );
  };

  const columns: Column<OrgSummary>[] = [
    {
      key: 'name',
      header: 'Client',
      render: (o) => (
        <div>
          <div className="font-medium text-slate-900">{o.name}</div>
          <div className="text-xs text-slate-400">{o.slug}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    { key: 'devices', header: 'Devices', render: (o) => `${o.deviceCount} / ${o.maxDevices}` },
    { key: 'users', header: 'Users', render: (o) => o.userCount },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (o) => (
        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {o.status === 'ACTIVE' ? (
            <button
              type="button"
              className="text-xs font-medium text-amber-600 hover:text-amber-700"
              onClick={() => onToggleStatus(o, 'SUSPENDED')}
            >
              Suspend
            </button>
          ) : (
            <button
              type="button"
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              onClick={() => onToggleStatus(o, 'ACTIVE')}
            >
              Activate
            </button>
          )}
          {o.status !== 'DEACTIVATED' && (
            <button
              type="button"
              className="text-xs font-medium text-red-600 hover:text-red-700"
              onClick={() => onToggleStatus(o, 'DEACTIVATED')}
            >
              Deactivate
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Clients"
        description="Organizations on the platform. Create, suspend, or deactivate tenants."
        actions={
          <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
            New client
          </button>
        }
      />
      <ErrorNotice error={orgs.error ?? updateStatus.error} />
      <DataTable
        columns={columns}
        rows={orgs.data?.items ?? []}
        rowKey={(o) => o.id}
        isLoading={orgs.isLoading}
        onRowClick={(o) => navigate(`/admin/clients/${o.id}`, { state: { org: o } })}
        emptyMessage="No clients yet."
      />
      {orgs.data && (
        <Pagination
          page={orgs.data.page}
          pageSize={orgs.data.pageSize}
          total={orgs.data.total}
          onPageChange={setPage}
        />
      )}
      <CreateOrgModal open={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}

interface OrgForm {
  name: string;
  slug: string;
  maxDevices: number;
  ownerEmail: string;
  password: string;
  clientSlug: string;
  platform: CimsPlatform;
  cimsClientId: string;
  webgetDbId: string;
  automationMode: AutomationMode;
}

const EMPTY_ORG_FORM: OrgForm = {
  name: '',
  slug: '',
  maxDevices: 2,
  ownerEmail: '',
  password: '',
  clientSlug: '',
  platform: 'PROXY',
  cimsClientId: '',
  webgetDbId: '',
  automationMode: 'MANUAL_LOGIN',
};

function CreateOrgModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateOrg();
  const toast = useToast();
  const [form, setForm] = useState<OrgForm>(EMPTY_ORG_FORM);

  const set = <K extends keyof OrgForm>(k: K, v: OrgForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload: CreateOrgInput = {
      name: form.name,
      slug: form.slug,
      maxDevices: form.maxDevices,
      ownerEmail: form.ownerEmail,
      password: form.password,
      clientSlug: form.clientSlug,
      platform: form.platform,
      cimsClientId: Number(form.cimsClientId),
      webgetDbId: Number(form.webgetDbId),
      automationMode: form.automationMode,
    };
    await create.mutateAsync(payload);
    toast.success('Client created', `${form.name} · owner can sign in`);
    setForm(EMPTY_ORG_FORM);
    onClose();
  };

  const domainSuffix = form.platform === 'ICC' ? 'omni' : 'oltp';

  return (
    <Modal
      open={open}
      title="Create client"
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="create-org-form"
            className="btn-primary"
            disabled={create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <form id="create-org-form" onSubmit={onSubmit} className="space-y-4">
        {create.error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {create.error instanceof Error ? create.error.message : 'Failed to create client.'}
          </div>
        )}

        {/* ── Organization + owner account ───────────────────────────────── */}
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Organization name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div>
            <label className="label">Slug</label>
            <input
              className="input"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value.toLowerCase())}
              pattern="[a-z0-9-]+"
              placeholder="acme-retail"
              required
            />
            <p className="mt-1 text-xs text-slate-400">Lowercase letters, numbers, hyphens.</p>
          </div>
          <div>
            <label className="label">Max devices</label>
            <input
              type="number"
              min={1}
              className="input"
              value={form.maxDevices}
              onChange={(e) => set('maxDevices', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Client Email ID</label>
            <input
              type="email"
              className="input"
              value={form.ownerEmail}
              onChange={(e) => set('ownerEmail', e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-slate-400">
              The client signs in to the desktop app with this email + password.
            </p>
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
          </div>
        </div>

        {/* ── Tenant CIMS / Webget / automation configuration ────────────── */}
        <div className="border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tenant configuration
          </p>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <div>
            <label className="label">CIMS client slug</label>
            <input
              className="input"
              value={form.clientSlug}
              onChange={(e) => set('clientSlug', e.target.value.toLowerCase())}
              pattern="[a-z0-9-]+"
              placeholder="adidasgcc"
              required
            />
          </div>
          <div>
            <label className="label">Platform</label>
            <select
              className="input"
              value={form.platform}
              onChange={(e) => set('platform', e.target.value as CimsPlatform)}
            >
              <option value="ICC">ICC</option>
              <option value="PROXY">Proxy</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-400">
              Domain:{' '}
              <span className="font-mono text-slate-600">
                {(form.clientSlug || 'slug') + '-' + domainSuffix}
              </span>{' '}
              · URL{' '}
              <span className="font-mono text-slate-600">
                https://{form.clientSlug || 'slug'}.omni.increff.com
              </span>
            </p>
          </div>
          <div>
            <label className="label">CIMS clientId</label>
            <input
              type="number"
              min={1}
              className="input"
              value={form.cimsClientId}
              onChange={(e) => set('cimsClientId', e.target.value)}
              placeholder="1100149303"
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
              onChange={(e) => set('webgetDbId', e.target.value)}
              placeholder="162"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Automation mode</label>
            <select
              className="input"
              value={form.automationMode}
              onChange={(e) => set('automationMode', e.target.value as AutomationMode)}
            >
              <option value="MANUAL_LOGIN">Manual login (user signs in)</option>
              <option value="AUTO_LOGIN">Auto login (stored credentials)</option>
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Manual login is recommended for most clients; auto login is for tenants whose
              marketplace sign-in can be automated.
            </p>
          </div>
        </div>
      </form>
    </Modal>
  );
}
