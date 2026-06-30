/**
 * 6-step sync timeline, ported from the reference dashboard. Step states come
 * from the sync store (derived via PHASE_TO_STEP). Step 3 surfaces the downloaded
 * filename as a badge, matching the reference UX.
 */
import { SYNC_STEPS } from '@rg/shared';
import type { StepState } from '../store/sync';
import { Check, X, Spinner } from './icons';

interface Props {
  steps: Record<number, StepState>;
  downloadedFile: string | null;
}

export function Timeline({ steps, downloadedFile }: Props) {
  return (
    <div className="flex flex-col">
      {SYNC_STEPS.map((step, idx) => {
        const state = steps[step.num] ?? 'pending';
        const isLast = idx === SYNC_STEPS.length - 1;
        const cls =
          state === 'active'
            ? 'is-active'
            : state === 'done'
              ? 'is-done'
              : state === 'error'
                ? 'is-error'
                : 'is-pending';
        return (
          <div key={step.num} className={`rg-timeline-item ${cls} ${isLast ? '' : 'mb-1'}`}>
            {!isLast && (
              <div
                className={`absolute left-[26px] top-[44px] -bottom-1.5 w-0.5 rounded ${state === 'done' ? 'bg-success' : 'bg-slate-200'}`}
              />
            )}
            <div className="rg-step-circle">
              {state === 'active' && <Spinner />}
              {state === 'done' && <Check />}
              {state === 'error' && <X />}
              {state === 'pending' && step.num}
            </div>
            <div className="min-w-0 flex-1">
              <div className="rg-step-title">{step.title}</div>
              <div className="rg-step-desc">{step.desc}</div>
              {step.num === 3 && state === 'done' && downloadedFile && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-sm border border-success/20 bg-success-light px-3 py-1.5 font-mono text-[0.72rem] font-semibold text-emerald-800 animate-fadeIn">
                  {downloadedFile}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
