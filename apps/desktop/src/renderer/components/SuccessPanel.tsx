/**
 * Success result panel, ported from the reference. Shows the success icon, the
 * stat row, a "Download Results CSV" button (full per-order detail + CIMS
 * response, saved to Downloads), and a "Start New Sync" reset button.
 */
import { useState } from 'react';
import type { Summary } from '../store/sync';
import { StatCards } from './StatCards';
import { Check, Spinner } from './icons';
import { ipc, errorMessage } from '../lib/ipc';

interface Props {
  summary: Summary | null;
  downloadedFile: string | null;
  syncRunId: string | null;
  onReset: () => void;
}

export function SuccessPanel({ summary, downloadedFile, syncRunId, onReset }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDownload = async () => {
    if (!syncRunId) return;
    setDownloading(true);
    setError(null);
    try {
      const { path } = await ipc.sync.downloadResults(syncRunId);
      setSavedPath(path);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="py-10 text-center animate-slideUp">
      <div
        className="rg-result-icon animate-bounceIn"
        style={{ background: 'linear-gradient(135deg,#10B981,#059669)', boxShadow: '0 0 32px rgba(16,185,129,0.4)' }}
      >
        <Check />
      </div>
      <h2 className="mb-2 text-xl font-extrabold">Sync Completed Successfully</h2>
      <p className="mx-auto max-w-lg text-sm text-ink-secondary">
        Marketplace return file processed and missing returns reconciled with the upload API.
      </p>

      {summary && (
        <div className="my-6">
          <StatCards
            total={summary.total}
            success={summary.success}
            failed={summary.failed}
            skipped={summary.skipped}
          />
        </div>
      )}

      {downloadedFile && (
        <p className="mt-2 font-mono text-[0.72rem] text-ink-muted">{downloadedFile}</p>
      )}

      <div className="mt-6 flex flex-col items-center gap-3">
        <div className="flex items-center justify-center gap-3">
          <button
            className="rg-btn rg-btn-ghost"
            onClick={onDownload}
            disabled={downloading || !syncRunId}
            title="Save a CSV with every order's CIMS status and response"
          >
            {downloading ? <Spinner /> : null} Download Results CSV
          </button>
          <button className="rg-btn rg-btn-primary" onClick={onReset}>
            Start New Sync
          </button>
        </div>

        {savedPath && (
          <p className="font-mono text-[0.72rem] text-success">Saved to {savedPath}</p>
        )}
        {error && <p className="text-[0.78rem] text-danger">{error}</p>}
      </div>
    </div>
  );
}
