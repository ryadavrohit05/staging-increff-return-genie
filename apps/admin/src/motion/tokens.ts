import type { Transition } from 'framer-motion';

/**
 * Centralized motion tokens — the single source of truth for every animation in
 * the admin portal. Inspired by Stripe / Linear / Vercel / Supabase: fast,
 * subtle, confident easing; springs reserved for interactive surfaces.
 *
 * RULES (enforced by convention across the motion system):
 *  - Animate only `transform` and `opacity` (GPU-composited, no layout thrash).
 *    The one deliberate exception is <Collapsible>, which animates `height` for
 *    auto-sizing reveal — used sparingly and never per-frame on large subtrees.
 *  - Keep durations short. Entrances ≤ 0.45s; micro-interactions ≤ 0.2s.
 *  - prefers-reduced-motion is honoured globally via <MotionProvider>.
 */

/** Durations in seconds (Framer Motion uses seconds, not ms). */
export const durations = {
  /** Instant feedback — taps, tiny state flips. */
  instant: 0.1,
  /** Micro-interactions — hover, focus, button press. */
  fast: 0.15,
  /** Default UI transitions — fades, most entrances. */
  base: 0.2,
  /** Larger surfaces — cards, page content. */
  medium: 0.3,
  /** Deliberate, weighty motion — drawers, large reveals. */
  slow: 0.45,
} as const;

/**
 * Easing curves as cubic-bezier tuples. `standard` is an expo-out curve that
 * gives the crisp, "settles into place" feel of premium SaaS dashboards.
 * Typed as mutable 4-tuples so they satisfy Framer Motion's `Easing` type.
 */
type Bezier = [number, number, number, number];
export const easings = {
  /** Expo-out — entrances and most enter transitions. */
  standard: [0.16, 1, 0.3, 1] as Bezier,
  /** Smooth symmetric — moves/repositioning. */
  inOut: [0.65, 0, 0.35, 1] as Bezier,
  /** Accelerate — exits / elements leaving the screen. */
  in: [0.4, 0, 1, 1] as Bezier,
  /** Soft decelerate — gentle reveals. */
  out: [0.22, 1, 0.36, 1] as Bezier,
};

/** Spring presets for interactive, physical motion (modals, layout shifts). */
export const springs = {
  /** Snappy and tight — layout indicators, hover lifts. */
  snappy: { type: 'spring', stiffness: 400, damping: 32, mass: 0.8 },
  /** Balanced default spring. */
  gentle: { type: 'spring', stiffness: 280, damping: 28, mass: 0.9 },
  /** A touch of overshoot — modal/drawer entrances. */
  pop: { type: 'spring', stiffness: 320, damping: 26, mass: 0.9 },
} as const satisfies Record<string, Transition>;

/** The default tween used when a component doesn't specify its own. */
export const defaultTransition: Transition = {
  duration: durations.base,
  ease: easings.standard,
};

/** Stagger timing for lists/grids (cards, table rows, nav items). */
export const stagger = {
  /** Delay between successive children. */
  each: 0.04,
  /** Initial delay before the first child animates. */
  delayChildren: 0.02,
} as const;
