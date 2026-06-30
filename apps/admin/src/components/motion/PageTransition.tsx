import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { pageTransition } from '../../motion';

/**
 * Route-level transition for the content area only.
 *
 * Rendered *inside* the persistent <Layout> (which owns the sidebar), so the
 * chrome never re-animates on navigation — only the page body cross-fades.
 *
 * `useOutlet()` captures the matched child route element; AnimatePresence keeps
 * the previous element mounted through its exit animation while the new one
 * enters. `mode="wait"` sequences exit→enter so the two pages never overlap.
 * `initial={false}` skips the animation on first paint (no flash on load).
 *
 * NOTE: we deliberately do NOT set `will-change: transform` here. A persistent
 * `will-change: transform` (or transform) makes this element the containing block
 * for any `position: fixed` descendant, which would mis-anchor overlays. Framer
 * Motion sets `will-change` only for the duration of the animation and clears it
 * afterwards; overlays additionally portal to <body> to stay viewport-anchored.
 */
export function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={location.pathname} variants={pageTransition} initial="initial" animate="animate" exit="exit">
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
