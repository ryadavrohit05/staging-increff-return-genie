/** Shared display formatters for the portal. */

/** Human-readable byte size, e.g. 1536 → "1.5 KB". */
export function humanizeBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const unit = units[exponent] ?? 'B';
  // Whole bytes show no decimals; larger units show one.
  return exponent === 0 ? `${value} ${unit}` : `${value.toFixed(1)} ${unit}`;
}

/** Full date + time in the viewer's locale, or an em-dash for nullish input. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/** Date only (no time), or an em-dash for nullish input. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}
