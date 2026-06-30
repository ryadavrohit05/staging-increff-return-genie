import { motion } from 'framer-motion';

/**
 * Loading skeleton with a GPU-friendly shimmer: a gradient highlight is swept
 * across the placeholder using `transform: translateX` (not background-position),
 * so it stays on the compositor thread. Under prefers-reduced-motion the sweep
 * is disabled by MotionConfig and the block renders as a static placeholder.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative block overflow-hidden rounded bg-slate-200/80 ${className}`}
    >
      <motion.span
        className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent"
        animate={{ x: ['-150%', '300%'] }}
        transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
      />
    </span>
  );
}

/**
 * Skeleton body for <DataTable> while data loads. Renders shimmer rows that match
 * the real table's column count so the layout doesn't shift when data arrives.
 */
export function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className={`h-4 ${c === 0 ? 'w-32' : 'w-16'}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
