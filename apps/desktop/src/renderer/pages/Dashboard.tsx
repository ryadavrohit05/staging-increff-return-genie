/**
 * Dashboard (ARCHITECTURE.md §15) — the sync control surface.
 *
 * Ports the reference dashboard UX: marketplace dropdown + date range (defaults
 * today-2 → today-1), a Start button gated on configured credentials + a valid
 * license, the 6-step Timeline, the LogTerminal, and Success/Failure panels —
 * all driven by the live SyncEvent stream in the sync store.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Marketplace, SyncStartInput } from '@rg/shared';
import { useSync } from '../store/sync';
import { useSettings } from '../store/settings';
import { ipc, errorMessage } from '../lib/ipc';
import { Timeline } from '../components/Timeline';
import { LogTerminal } from '../components/LogTerminal';
import { SuccessPanel } from '../components/SuccessPanel';
import { FailurePanel } from '../components/FailurePanel';
import { Layers, Play, Stop, Alert, Clock } from '../components/icons';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function todayMinus(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function Dashboard() {
  const sync = useSync();
  const { creds, license, refreshCreds, refreshLicense } = useSettings();

  const [marketplace, setMarketplace] = useState<Marketplace | ''>('');
  const [startDate, setStartDate] = useState(todayMinus(2));
  const [endDate, setEndDate] = useState(todayMinus(1));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [startError, setStartError] = useState<string | null>(null);
  const [termVisible, setTermVisible] = useState(true);
  const [elapsed, setElapsed] = useState('00:00');

  useEffect(() => {
    void refreshCreds();
    void refreshLicense();
    // Tray "Sync now" focuses this page; nothing else to do here.
    const off = ipc.app.onSyncNow(() => {});
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elapsed timer while running.
  useEffect(() => {
    if (!sync.running) return;
    const startedAt = Date.now();
    const iv = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
    }, 500);
    return () => clearInterval(iv);
  }, [sync.running]);

  const credFor = useMemo(
    () => (m: Marketplace | '') => (m ? creds.find((c) => c.marketplace === m) : undefined),
    [creds],
  );
  const selectedConfigured = credFor(marketplace)?.configured ?? false;
  const licenseOk = license?.ok ?? true; // optimistic until validate resolves
  const updateRequired = license?.updateRequired ?? false;

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!marketplace) e.marketplace = 'Select a marketplace';
    if (!startDate) e.startDate = 'Pick a start date';
    if (!endDate) e.endDate = 'Pick an end date';
    if (startDate && endDate && startDate > endDate) e.endDate = 'End date must be on or after start';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onStart(e: FormEvent) {
    e.preventDefault();
    setStartError(null);
    if (!validate()) return;
    try {
      await sync.start({ marketplace, startDate, endDate } as SyncStartInput);
    } catch (err) {
      setStartError(errorMessage(err));
    }
  }

  const startDisabled =
    sync.running || !marketplace || !selectedConfigured || !licenseOk || updateRequired;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-extrabold text-ink-primary">Marketplace Reconciliation</h1>
        <p className="text-sm text-ink-secondary">
          Download a marketplace return report locally and sync missing returns.
        </p>
      </header>

      <div className="rg-card">
        <div className="rg-card-header">
          <div className="rg-card-title">
            <span className="rg-card-title-icon">
              <Layers />
            </span>
            Sync Marketplace
          </div>
          {sync.syncRunId && (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 font-mono text-[0.68rem] text-ink-muted">
              run {sync.syncRunId.slice(0, 8)}
            </span>
          )}
        </div>

        <div className="rg-card-body">
          {sync.view === 'form' && (
            <form onSubmit={onStart} className="animate-fadeIn">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="rg-label">Marketplace</label>
                  <select
                    className="rg-select"
                    value={marketplace}
                    onChange={(e) => setMarketplace(e.target.value as Marketplace)}
                  >
                    <option value="" disabled>
                      Select source…
                    </option>
                    <option value="MYNTRA">MYNTRA</option>
                    <option value="FLIPKART">FLIPKART</option>
                  </select>
                  {errors.marketplace && (
                    <div className="rg-error">
                      <Alert /> {errors.marketplace}
                    </div>
                  )}
                </div>
                <div>
                  <label className="rg-label">Start Date</label>
                  <input
                    type="date"
                    className="rg-input"
                    value={startDate}
                    max={today()}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  {errors.startDate && (
                    <div className="rg-error">
                      <Alert /> {errors.startDate}
                    </div>
                  )}
                </div>
                <div>
                  <label className="rg-label">End Date</label>
                  <input
                    type="date"
                    className="rg-input"
                    value={endDate}
                    max={today()}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                  {errors.endDate && (
                    <div className="rg-error">
                      <Alert /> {errors.endDate}
                    </div>
                  )}
                </div>
              </div>

              {/* Gating notices */}
              {marketplace && !selectedConfigured && (
                <div className="mt-4 rounded-sm border border-warning/25 bg-warning-light px-3 py-2 text-[0.78rem] text-amber-700">
                  No credentials saved for {marketplace}.{' '}
                  <Link to="/settings" className="font-bold underline">
                    Add them in Settings
                  </Link>
                  .
                </div>
              )}
              {updateRequired && (
                <div className="mt-4 rounded-sm border border-danger/25 bg-danger-light px-3 py-2 text-[0.78rem] text-danger">
                  A required update is available. Update from Settings → Updates to continue.
                </div>
              )}
              {!updateRequired && license && !licenseOk && (
                <div className="mt-4 rounded-sm border border-danger/25 bg-danger-light px-3 py-2 text-[0.78rem] text-danger">
                  Your license is not active. Contact support.
                </div>
              )}
              {startError && (
                <div className="rg-error mt-4">
                  <Alert /> {startError}
                </div>
              )}

              <div className="mt-5 flex justify-end">
                <button type="submit" className="rg-btn rg-btn-primary" disabled={startDisabled}>
                  <Play /> Initialize Sync
                </button>
              </div>
            </form>
          )}

          {sync.view === 'processing' && (
            <div className="animate-slideUp">
              <div className="mb-5 flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 animate-dotPulse rounded-full bg-primary" />
                <span className="text-[0.78rem] font-bold uppercase tracking-[0.04em] text-ink-secondary">
                  {sync.stageLabel}
                </span>
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[0.72rem] font-bold uppercase tracking-[0.05em] text-ink-secondary">
                    Overall Progress
                  </span>
                  <span className="font-mono text-[0.72rem] font-bold text-primary">
                    {sync.progress}%
                  </span>
                </div>
                <div className="rg-progress-track">
                  <div className="rg-progress-fill" style={{ width: `${sync.progress}%` }} />
                </div>
              </div>

              <Timeline steps={sync.steps} downloadedFile={sync.downloadedFile} />

              <div className="mt-4 flex items-center justify-between border-t border-slate-200/60 pt-3">
                <span className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted">
                  <Clock /> Elapsed:{' '}
                  <span className="font-mono font-bold text-ink-primary">{elapsed}</span>
                </span>
                <button className="rg-btn rg-btn-danger" onClick={() => void sync.cancel()}>
                  <Stop /> Cancel
                </button>
              </div>
            </div>
          )}

          {sync.view === 'success' && (
            <SuccessPanel
              summary={sync.summary}
              downloadedFile={sync.downloadedFile}
              syncRunId={sync.syncRunId}
              onReset={() => sync.reset()}
            />
          )}

          {sync.view === 'failure' && sync.failure && (
            <FailurePanel
              code={sync.failure.code}
              message={sync.failure.message}
              logs={sync.logs}
              onRetry={() => sync.reset()}
            />
          )}
        </div>
      </div>

      {(sync.view === 'processing' || sync.logs.length > 0) && (
        <LogTerminal logs={sync.logs} visible={termVisible} onToggle={() => setTermVisible((v) => !v)} />
      )}
    </div>
  );
}
