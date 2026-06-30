import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreateOrgInput, OrgSummary, OrgStatus } from '@rg/shared';
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

function CreateOrgModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateOrg();
  const toast = useToast();
  const [form, setForm] = useState<CreateOrgInput>({
    name: '',
    slug: '',
    maxDevices: 2,
    ownerEmail: '',
    password: '',
  });

  const set = <K extends keyof CreateOrgInput>(k: K, v: CreateOrgInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await create.mutateAsync(form);
    toast.success('Client created', `${form.name} · owner can sign in`);
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Create client"
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
      <form id="create-org-form" onSubmit={onSubmit} className="space-y-3">
        {create.error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {create.error instanceof Error ? create.error.message : 'Failed to create client.'}
          </div>
        )}
        <div>
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
          <label className="label">Owner email</label>
          <input
            type="email"
            className="input"
            value={form.ownerEmail}
            onChange={(e) => set('ownerEmail', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">
            The owner signs in to the desktop app with this email and the password below.
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
      </form>
    </Modal>
  );
}
