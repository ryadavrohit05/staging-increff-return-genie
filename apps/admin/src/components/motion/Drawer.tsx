import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { overlay, drawerRight } from '../../motion';

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Width utility (Tailwind). Default: "max-w-md". */
  widthClass?: string;
}

/**
 * Right-side slide-over drawer. Shares the modal's overlay-fade language but the
 * panel slides in on `transform: translateX` (GPU-composited). Same a11y contract
 * as <Modal>: Escape to close, click-scrim to dismiss, role="dialog".
 *
 * Part of the motion design system and ready to use for side-panel flows; not
 * mounted into existing screens (which would change their layout).
 */
export function Drawer({ open, title, onClose, children, footer, widthClass = 'max-w-md' }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Portal to <body> so the fixed overlay anchors to the viewport, not to any
  // transformed ancestor (page-transition wrapper). Backdrop only fades; the
  // slide (translateX) is isolated to the inner panel.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/50"
          variants={overlay}
          initial="hidden"
          animate="visible"
          exit="exit"
          onMouseDown={onClose}
        >
          <motion.aside
            className={`flex h-full w-full ${widthClass} flex-col bg-white shadow-xl`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            variants={drawerRight}
            initial="hidden"
            animate="visible"
            exit="exit"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ willChange: 'transform' }}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
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
            <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
