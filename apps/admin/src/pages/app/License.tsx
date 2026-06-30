import type { ReactNode } from 'react';
import { PageHeader, ErrorNotice } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { Stagger, StaggerItem } from '../../components/motion';
import { useLicenseStatus } from '../../lib/clientQueries';

function StatCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <StaggerItem className="card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1.5 text-lg font-semibold text-slate-900">{children}</div>
    </StaggerItem>
  );
}

export function License() {
  const license = useLicenseStatus();
  const d = license.data;

  return (
    <>
      <PageHeader
        title="License"
        description="Your organization's Return Genie subscription and device allowance."
      />
      <ErrorNotice error={license.error} />

      {license.isLoading && (
        <div className="card p-8 text-sm text-slate-500">Loading license…</div>
      )}

      {d && (
        <>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Plan">{d.plan}</StatCard>
            <StatCard label="Status">
              <StatusBadge status={d.status} />
            </StatCard>
            <StatCard label="Devices">
              {d.activeDevices} / {d.maxDevices}
            </StatCard>
          </Stagger>

          {d.updateRequired && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Update required.</strong> Your installed app is older than the minimum
              supported version (v{d.minSupportedVersion}). Download the latest version to continue
              syncing.
            </div>
          )}

          {!d.ok && !d.updateRequired && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Your license is not currently active. Contact your administrator to restore access.
            </div>
          )}
        </>
      )}
    </>
  );
}
