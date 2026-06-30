import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { durations, easings, stagger } from '../motion';
import { TableSkeleton } from './motion';

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer; receives the row. */
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

/** Cap the entrance stagger so large pages don't have a long ripple. */
const MAX_STAGGER_ROWS = 12;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isLoading,
  emptyMessage = 'No records found.',
}: DataTableProps<T>) {
  return (
    <div className="card overflow-hidden">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${c.className ?? ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {isLoading && <TableSkeleton columns={columns.length} />}
          {!isLoading && rows.length === 0 && (
            <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                {emptyMessage}
              </td>
            </motion.tr>
          )}
          {!isLoading && (
            // popLayout lets removed rows animate out while the rest settle into
            // place; `layout="position"` makes sorting/reordering glide via
            // translation only — animating row *size* (plain `layout`) distorts
            // table cell widths and misaligns columns mid-transition. `initial=
            // {false}` skips the entrance on first paint so it doesn't double up
            // with the page transition — rows animate on changes.
            <AnimatePresence mode="popLayout" initial={false}>
              {rows.map((row, i) => (
                <motion.tr
                  key={rowKey(row)}
                  layout="position"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: durations.base,
                      ease: easings.standard,
                      delay: Math.min(i, MAX_STAGGER_ROWS) * stagger.each,
                    },
                  }}
                  exit={{ opacity: 0, transition: { duration: durations.fast, ease: easings.in } }}
                  className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-2.5 text-slate-700 ${c.className ?? ''}`}>
                      {c.render(row)}
                    </td>
                  ))}
                </motion.tr>
              ))}
            </AnimatePresence>
          )}
        </tbody>
      </table>
    </div>
  );
}
