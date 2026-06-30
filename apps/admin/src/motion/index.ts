/**
 * Motion design system — public surface.
 *
 * Tokens + variants define *what* the motion is; the components in
 * `src/components/motion` define *how* it's applied. Import from here so the
 * rest of the app never reaches into individual files.
 */
export * from './tokens';
export * from './variants';
export { MotionProvider } from './MotionProvider';
