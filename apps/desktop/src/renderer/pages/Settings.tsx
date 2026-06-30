/**
 * Settings page with four tabs:
 *   - Credentials: add/edit/delete marketplace creds (masked password, validated)
 *   - Device: fingerprint/hostname/os/version + status
 *   - License: status / plan / device usage
 *   - Updates: current version + update lifecycle + install button
 */
import { useEffect, useState, type FormEvent } from 'react';
import type { CredentialInput, Marketplace } from '@rg/shared';
import { CredentialInput as CredentialInputSchema } from '@rg/shared';
import { useSettings } from '../store/settings';
import { MaskedInput } from '../components/MaskedInput';
import { Spinner, Alert, Check } from '../components/icons';
import { errorMessage } from '../lib/ipc';

type Tab = 'creds' | 'device' | 'license' | 'updates';

const MARKETPLACES: Marketplace[] = ['MYNTRA', 'FLIPKART'];

export function Settings() {
  const [tab, setTab] = useState<Tab>('creds');
  return (
    <div className="rg-card">
      <div className="rg-card-header">
        <div className="rg-card-title">Settings</div>
        <div className="flex gap-1">
          {(
            [
              ['creds', 'Credentials'],
              ['device', 'Device'],
              ['license', 'License'],
              ['updates', 'Updates'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-sm px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.05em] transition ${
                tab === k ? 'bg-primary-light text-primary' : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="rg-card-body">
        {tab === 'creds' && <CredentialsTab />}
        {tab === 'device' && <DeviceTab />}
        {tab === 'license' && <LicenseTab />}
        {tab === 'updates' && <UpdatesTab />}
      </div>
    </div>
  );
}

// ── Credentials ──────────────────────────────────────────────────────────────

function CredentialsTab() {
  const { creds, refreshCreds } = useSettings();
  const [editing, setEditing] = useState<Marketplace | null>(null);

  useEffect(() => {
    void refreshCreds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {MARKETPLACES.map((m) => {
        const status = creds.find((c) => c.marketplace === m);
        return (
          <div key={m} className="rounded-md border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold">{m}</div>
                <div className="text-[0.75rem] text-ink-muted">
                  {status?.configured ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Check /> Configured{status.label ? ` · ${status.label}` : ''}
                    </span>
                  ) : (
                    'Not configured'
                  )}
                </div>
              </div>
              <button
                className="rg-btn rg-btn-ghost"
                onClick={() => setEditing(editing === m ? null : m)}
              >
                {status?.configured ? 'Edit' : 'Add'}
              </button>
            </div>
            {editing === m && (
              <CredentialForm
                marketplace={m}
                onDone={() => {
                  setEditing(null);
                  void refreshCreds();
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CredentialForm({ marketplace, onDone }: { marketplace: Marketplace; onDone: () => void }) {
  const { refreshCreds } = useSettings();
  const [label, setLabel] = useState(`${marketplace} account`);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const candidate: CredentialInput = { marketplace, label, email, password };
    const parsed = CredentialInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError('All fields are required.');
      return;
    }
    setSaving(true);
    try {
      await window.rg.creds.save(parsed.data).then((r) => {
        if (!r.ok) throw new Error(r.error.message);
      });
      await refreshCreds();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await window.rg.creds.clear(marketplace);
      await refreshCreds();
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-4 border-t border-slate-100 pt-4 animate-fadeIn">
      {error && (
        <div className="rg-error mb-3">
          <Alert /> {error}
        </div>
      )}
      <div className="mb-3">
        <label className="rg-label">Label</label>
        <input className="rg-input" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="mb-3">
        <label className="rg-label">{marketplace} Email / Username</label>
        <input
          className="rg-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="partner@example.com"
        />
      </div>
      <div className="mb-4">
        <label className="rg-label">{marketplace} Password</label>
        <MaskedInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        <p className="mt-1 text-[0.7rem] text-ink-muted">
          Stored encrypted on this machine only — never sent to our servers.
        </p>
      </div>
      <div className="flex justify-between">
        <button type="button" className="rg-btn rg-btn-danger" onClick={() => void remove()} disabled={saving}>
          Delete
        </button>
        <button type="submit" className="rg-btn rg-btn-primary" disabled={saving}>
          {saving ? <Spinner /> : null} Save
        </button>
      </div>
    </form>
  );
}

// ── Device ───────────────────────────────────────────────────────────────────

function DeviceTab() {
  const { device, refreshDevice } = useSettings();
  useEffect(() => {
    void refreshDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!device) return <p className="text-sm text-ink-muted">Loading device info…</p>;

  const rows: Array<[string, string]> = [
    ['Hostname', device.hostname],
    ['Operating System', device.os],
    ['App Version', device.appVersion],
    ['Status', device.status],
    ['Fingerprint', `${device.fingerprint.slice(0, 16)}…`],
    ['Last Heartbeat', device.lastHeartbeat ? new Date(device.lastHeartbeat).toLocaleString() : '—'],
    ['Registered', new Date(device.registeredAt).toLocaleString()],
  ];

  return (
    <dl className="divide-y divide-slate-100">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between py-2.5">
          <dt className="text-[0.78rem] font-bold uppercase tracking-[0.04em] text-ink-secondary">{k}</dt>
          <dd className="font-mono text-[0.82rem] text-ink-primary">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── License ──────────────────────────────────────────────────────────────────

function LicenseTab() {
  const { license, refreshLicense } = useSettings();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void refreshLicense().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-sm text-ink-muted">Validating license…</p>;
  if (!license) return <p className="text-sm text-danger">Could not load license status.</p>;

  const rows: Array<[string, string]> = [
    ['Status', license.status],
    ['Plan', license.plan],
    ['Devices', `${license.activeDevices} / ${license.maxDevices}`],
    ['Minimum App Version', license.minSupportedVersion],
  ];

  return (
    <>
      <div
        className={`mb-4 rounded-sm border px-3 py-2 text-[0.8rem] font-bold ${
          license.ok
            ? 'border-success/25 bg-success-light text-success'
            : 'border-danger/25 bg-danger-light text-danger'
        }`}
      >
        {license.ok ? 'License active' : 'License inactive'}
        {license.updateRequired && ' · update required'}
      </div>
      <dl className="divide-y divide-slate-100">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2.5">
            <dt className="text-[0.78rem] font-bold uppercase tracking-[0.04em] text-ink-secondary">{k}</dt>
            <dd className="font-mono text-[0.82rem] text-ink-primary">{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

// ── Updates ──────────────────────────────────────────────────────────────────

function UpdatesTab() {
  const { version, update, refreshVersion, installUpdate, _bindUpdate } = useSettings();

  useEffect(() => {
    void refreshVersion();
    _bindUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between py-2.5">
        <span className="text-[0.78rem] font-bold uppercase tracking-[0.04em] text-ink-secondary">
          Current Version
        </span>
        <span className="font-mono text-[0.82rem]">{version || '—'}</span>
      </div>

      {!update && <p className="text-sm text-ink-muted">Checking for updates in the background…</p>}

      {update?.status === 'checking' && <p className="text-sm text-ink-muted">Checking for updates…</p>}
      {update?.status === 'not-available' && (
        <p className="inline-flex items-center gap-1 text-sm text-success">
          <Check /> You are on the latest version.
        </p>
      )}
      {update?.status === 'available' && (
        <p className="text-sm text-ink-secondary">
          Update {update.version} available — downloading…
        </p>
      )}
      {update?.status === 'progress' && (
        <div>
          <p className="mb-2 text-sm text-ink-secondary">Downloading update… {update.percent}%</p>
          <div className="rg-progress-track">
            <div className="rg-progress-fill" style={{ width: `${update.percent ?? 0}%` }} />
          </div>
        </div>
      )}
      {update?.status === 'downloaded' && (
        <div className="flex items-center justify-between rounded-sm border border-primary/25 bg-primary-light px-3 py-2">
          <span className="text-sm font-bold text-primary">
            Update {update.version} ready to install.
          </span>
          <button className="rg-btn rg-btn-primary" onClick={() => void installUpdate()}>
            Restart & Install
          </button>
        </div>
      )}
      {update?.status === 'error' && (
        <p className="inline-flex items-center gap-1 text-sm text-danger">
          <Alert /> Update error: {update.message}
        </p>
      )}
    </div>
  );
}
