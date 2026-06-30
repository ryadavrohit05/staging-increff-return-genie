/**
 * Stat pills (Total / Synced / Failed / Skipped), ported from the reference's
 * success-panel stats row. Reused on the Dashboard success panel and in Results.
 */
import { Check, X } from './icons';

interface Props {
  total: number;
  success: number;
  failed: number;
  skipped?: number;
}

export function StatCards({ total, success, failed, skipped }: Props) {
  return (
    <div className="flex flex-wrap justify-center gap-4">
      <div className="rg-stat border-slate-200 bg-slate-50">
        <div className="rg-stat-label">Total</div>
        <div className="rg-stat-val">{total.toLocaleString()}</div>
      </div>
      <div className="rg-stat border-success/25 bg-success-light">
        <div className="rg-stat-label inline-flex items-center gap-1 text-success">
          <Check /> Synced
        </div>
        <div className="rg-stat-val text-success">{success.toLocaleString()}</div>
      </div>
      <div className="rg-stat border-danger/25 bg-danger-light">
        <div className="rg-stat-label inline-flex items-center gap-1 text-danger">
          <X /> Failed
        </div>
        <div className="rg-stat-val text-danger">{failed.toLocaleString()}</div>
      </div>
      {typeof skipped === 'number' && (
        <div className="rg-stat border-warning/25 bg-warning-light">
          <div className="rg-stat-label text-warning">Skipped</div>
          <div className="rg-stat-val">{skipped.toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}
