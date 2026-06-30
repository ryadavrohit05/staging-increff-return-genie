import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from 'framer-motion';
import { toastItem } from '../../motion';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss duration in ms. Default 4000. */
  duration?: number;
}

interface ToastRecord {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  push: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE: Record<ToastVariant, { bar: string; ring: string; icon: string; label: string }> = {
  success: { bar: 'bg-emerald-500', ring: 'border-emerald-200', icon: 'text-emerald-500', label: '✓' },
  error: { bar: 'bg-red-500', ring: 'border-red-200', icon: 'text-red-500', label: '!' },
  info: { bar: 'bg-brand-500', ring: 'border-brand-200', icon: 'text-brand-500', label: 'i' },
};

/**
 * Toast provider. Wrap the app once; consume via {@link useToast}. Toasts slide +
 * fade in from the right (spring), stack with AnimatePresence, and auto-dismiss
 * with a transform-driven progress bar that pauses on hover.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((opts: ToastOptions) => {
    const id = ++idRef.current;
    setToasts((list) => [
      ...list,
      {
        id,
        title: opts.title,
        description: opts.description,
        variant: opts.variant ?? 'info',
        duration: opts.duration ?? 4000,
      },
    ]);
    return id;
  }, []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastRecord[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: number) => void }) {
  const tone = TONE[toast.variant];
  const progress = useMotionValue(1);
  const controls = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    const c = animate(progress, 0, {
      duration: toast.duration / 1000,
      ease: 'linear',
      onComplete: () => onDismiss(toast.id),
    });
    controls.current = c;
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      layout
      className={`pointer-events-auto overflow-hidden rounded-lg border ${tone.ring} bg-white shadow-lg`}
      variants={toastItem}
      initial="hidden"
      animate="visible"
      exit="exit"
      onHoverStart={() => controls.current?.pause()}
      onHoverEnd={() => controls.current?.play()}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xs font-bold ${tone.icon}`}
          aria-hidden
        >
          {tone.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-900">{toast.title}</div>
          {toast.description && (
            <div className="mt-0.5 break-words text-xs text-slate-500">{toast.description}</div>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 text-slate-300 transition-colors hover:text-slate-500"
          aria-label="Dismiss"
          onClick={() => onDismiss(toast.id)}
        >
          ✕
        </button>
      </div>
      <div className="h-0.5 w-full bg-slate-100">
        <motion.div className={`h-full w-full ${tone.bar}`} style={{ originX: 0, scaleX: progress }} />
      </div>
    </motion.div>
  );
}

/**
 * Toast API. `toast.success(...)` / `.error(...)` / `.info(...)` or the generic
 * `toast(opts)`. Returns the toast id (for manual `dismiss`).
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  const { push, dismiss } = ctx;
  return useMemo(
    () => ({
      toast: push,
      success: (title: string, description?: string) => push({ title, description, variant: 'success' }),
      error: (title: string, description?: string) => push({ title, description, variant: 'error' }),
      info: (title: string, description?: string) => push({ title, description, variant: 'info' }),
      dismiss,
    }),
    [push, dismiss],
  );
}
