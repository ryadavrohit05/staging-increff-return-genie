import type { Variants } from 'framer-motion';
import { durations, easings, springs, stagger } from './tokens';

/**
 * Reusable Framer Motion variants. Components reference these by name so motion
 * stays consistent app-wide and tunable from one place. Every variant animates
 * transform/opacity only (see tokens.ts), except where a component documents an
 * intentional height animation.
 */

// ── Primitives ────────────────────────────────────────────────────────────────

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: durations.base, ease: easings.standard } },
  exit: { opacity: 0, transition: { duration: durations.fast, ease: easings.in } },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: durations.medium, ease: easings.standard } },
  exit: { opacity: 0, y: 4, transition: { duration: durations.fast, ease: easings.in } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: durations.base, ease: easings.standard } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: durations.fast, ease: easings.in } },
};

// ── Lists & grids (cards, table rows, nav, results) ─────────────────────────────

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: stagger.each, delayChildren: stagger.delayChildren },
  },
  exit: {},
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: durations.medium, ease: easings.standard } },
  exit: { opacity: 0, y: 4, transition: { duration: durations.fast, ease: easings.in } },
};

/** Table rows — slightly smaller travel so dense data doesn't feel jumpy. */
export const tableRow: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: durations.base, ease: easings.standard } },
  exit: { opacity: 0, transition: { duration: durations.fast, ease: easings.in } },
};

// ── Page route transitions ──────────────────────────────────────────────────────

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: durations.medium, ease: easings.standard } },
  exit: { opacity: 0, y: -6, transition: { duration: durations.fast, ease: easings.in } },
};

// ── Overlays: modals & drawers ──────────────────────────────────────────────────

export const overlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: durations.base, ease: easings.standard } },
  exit: { opacity: 0, transition: { duration: durations.fast, ease: easings.in } },
};

export const modalPanel: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springs.pop },
  exit: { opacity: 0, scale: 0.97, y: 6, transition: { duration: durations.fast, ease: easings.in } },
};

export const drawerRight: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: springs.gentle },
  exit: { x: '100%', transition: { duration: durations.medium, ease: easings.in } },
};

// ── Toasts ──────────────────────────────────────────────────────────────────────

export const toastItem: Variants = {
  hidden: { opacity: 0, x: 24, scale: 0.96 },
  visible: { opacity: 1, x: 0, scale: 1, transition: springs.gentle },
  exit: { opacity: 0, x: 24, scale: 0.96, transition: { duration: durations.base, ease: easings.in } },
};
