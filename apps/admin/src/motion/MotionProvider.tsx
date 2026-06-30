import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { defaultTransition } from './tokens';

/**
 * App-wide motion configuration.
 *
 * - `reducedMotion="user"` makes Framer Motion automatically honour the OS-level
 *   `prefers-reduced-motion` setting: transform/layout animations are disabled
 *   (values jump to their target) while opacity is preserved, so the UI stays
 *   legible and non-distracting for users who opt out of motion. This is the
 *   single accessibility switch for the entire animation system.
 * - A default `transition` means components that don't specify one still feel
 *   consistent with the rest of the app.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={defaultTransition}>
      {children}
    </MotionConfig>
  );
}
