import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { durations, easings } from '../../motion';

/**
 * Smooth height collapse/expand.
 *
 * NOTE: this is the one motion primitive that animates `height` (to auto-size to
 * its content) rather than pure transform/opacity. It's intended for low-cadence,
 * user-initiated reveals (filter panels, detail sections) — not for high-frequency
 * or large subtrees. `overflow: hidden` clips content during the transition;
 * opacity is co-animated so content doesn't pop in at half-height.
 */
export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapsible"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { duration: durations.medium, ease: easings.inOut },
            opacity: { duration: durations.fast, ease: easings.standard },
          }}
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
