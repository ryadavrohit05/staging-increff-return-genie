import { motion } from 'framer-motion';
import { durations, easings } from '../../motion';

interface ProgressBarProps {
  /** Progress from 0 to 1. */
  value: number;
  className?: string;
  /** Track height utility (Tailwind), e.g. "h-1" (default) or "h-1.5". */
  heightClass?: string;
  /** Fill color utility (Tailwind), e.g. "bg-brand-600" (default). */
  fillClass?: string;
}

/**
 * Smoothly-eased progress / sync indicator. The fill is animated with `scaleX`
 * (transform-only, GPU-composited) rather than `width`, so updates never trigger
 * layout. Drive `value` from sync state (e.g. processed/total) for a fluid bar.
 */
export function ProgressBar({
  value,
  className = '',
  heightClass = 'h-1',
  fillClass = 'bg-brand-600',
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className={`${heightClass} w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <motion.div
        className={`h-full w-full ${fillClass}`}
        style={{ originX: 0 }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: clamped }}
        transition={{ duration: durations.medium, ease: easings.out }}
      />
    </div>
  );
}
