import { motion, type HTMLMotionProps } from 'framer-motion';
import { fade, fadeInUp, scaleIn, staggerContainer, staggerItem } from '../../motion';
import { springs } from '../../motion';

type DivProps = HTMLMotionProps<'div'>;

/**
 * Thin, reusable motion wrappers. They default to the shared variants but accept
 * any motion prop override, so a component can opt into a different feel without
 * leaving the design system.
 *
 * Composition:
 *   <Stagger>            → orchestrates children
 *     <StaggerItem/>     → each child eases in, offset by tokens.stagger.each
 *   </Stagger>
 *
 * Standalone:
 *   <FadeIn/> <FadeInUp/> <ScaleIn/>  → animate themselves on mount/unmount.
 */

export function FadeIn({ children, ...rest }: DivProps) {
  return (
    <motion.div variants={fade} initial="hidden" animate="visible" exit="exit" {...rest}>
      {children}
    </motion.div>
  );
}

export function FadeInUp({ children, ...rest }: DivProps) {
  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="visible" exit="exit" {...rest}>
      {children}
    </motion.div>
  );
}

export function ScaleIn({ children, ...rest }: DivProps) {
  return (
    <motion.div variants={scaleIn} initial="hidden" animate="visible" exit="exit" {...rest}>
      {children}
    </motion.div>
  );
}

/** Container that orchestrates a staggered reveal of its <StaggerItem> children. */
export function Stagger({ children, ...rest }: DivProps) {
  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" exit="exit" {...rest}>
      {children}
    </motion.div>
  );
}

/** A single staggered child — inherits its animation state from <Stagger>. */
export function StaggerItem({ children, ...rest }: DivProps) {
  return (
    <motion.div variants={staggerItem} {...rest}>
      {children}
    </motion.div>
  );
}

interface AnimatedCardProps extends DivProps {
  /** Enable a subtle hover lift (transform-only). Pair with `hover:shadow-md`. */
  interactive?: boolean;
}

/**
 * A self-animating card surface: eases up + in on mount, optional hover lift.
 * Does NOT inject the `.card` class — pass it via `className` so existing card
 * styling is preserved exactly.
 */
export function AnimatedCard({ interactive, children, ...rest }: AnimatedCardProps) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileHover={interactive ? { y: -2, transition: springs.snappy } : undefined}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
