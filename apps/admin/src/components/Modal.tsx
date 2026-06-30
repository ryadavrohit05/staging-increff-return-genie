import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { overlay, modalPanel } from '../motion';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Panel width. Defaults to 'md' (the original max-w-lg). */
  size?: 'md' | 'lg' | 'xl';
}

const SIZE_CLASS: Record<NonNullable<ModalProps['size']>, string> = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
};

export function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Portal to <body> so the fixed overlay escapes any transformed ancestor
  // (e.g. the page-transition motion.div). A `transform`/`will-change: transform`
  // ancestor would otherwise become the containing block for `position: fixed`,
  // breaking full-viewport coverage and centering. The backdrop is the flex
  // centering context and only fades (opacity); the scale/translate animation is
  // isolated to the inner panel, which scales from its center → never shifts.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          variants={overlay}
          initial="hidden"
          animate="visible"
          exit="exit"
          onMouseDown={onClose}
        >
          <motion.div
            className={`card flex max-h-[90vh] w-full flex-col ${SIZE_CLASS[size]}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            variants={modalPanel}
            initial="hidden"
            animate="visible"
            exit="exit"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ willChange: 'transform, opacity' }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
              <button
                type="button"
                className="text-slate-400 transition-colors hover:text-slate-600"
                aria-label="Close"
                onClick={onClose}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
