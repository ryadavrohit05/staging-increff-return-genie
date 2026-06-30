interface StatusBadgeProps {
  status: string;
}

/** Color-coded pill for org/license/device/sync states. */
const TONE: Record<string, string> = {
  // Positive
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  SUCCEEDED: 'bg-emerald-100 text-emerald-700',
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  // Neutral / in-flight
  QUEUED: 'bg-slate-100 text-slate-600',
  RUNNING: 'bg-blue-100 text-blue-700',
  DOWNLOADING: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  UPLOADING: 'bg-blue-100 text-blue-700',
  // Warning
  SUSPENDED: 'bg-amber-100 text-amber-700',
  EXPIRED: 'bg-amber-100 text-amber-700',
  SKIPPED: 'bg-amber-100 text-amber-700',
  // Negative
  DEACTIVATED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-200 text-slate-600',
  REVOKED: 'bg-red-100 text-red-700',
  FAILED: 'bg-red-100 text-red-700',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const tone = TONE[status] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
}
