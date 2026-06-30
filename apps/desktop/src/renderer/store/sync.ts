/**
 * Sync store: drives the Dashboard's live console + timeline.
 *
 * Step states are derived from SyncPhase via PHASE_TO_STEP (shared) so the 6-step
 * timeline matches the reference dashboard exactly. The live SyncEvent stream
 * from main is buffered here.
 */
import { create } from 'zustand';
import {
  PHASE_TO_STEP,
  SYNC_STEPS,
  SyncState,
  type SyncEvent,
  type SyncStartInput,
} from '@rg/shared';
import { ipc, errorMessage } from '../lib/ipc';

export type StepState = 'pending' | 'active' | 'done' | 'error';
export type View = 'form' | 'processing' | 'success' | 'failure';

export interface LogLine {
  ts: number;
  level: string;
  stage: string;
  message: string;
}

export interface Summary {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

interface SyncStore {
  view: View;
  running: boolean;
  syncRunId: string | null;
  logs: LogLine[];
  steps: Record<number, StepState>;
  progress: number;
  stageLabel: string;
  summary: Summary | null;
  failure: { code: string; message: string } | null;
  downloadedFile: string | null;

  start: (input: SyncStartInput) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
  _ingest: (e: SyncEvent) => void;
  _bindStream: () => void;
}

const PENDING_STEPS: Record<number, StepState> = { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending', 6: 'pending' };

let unbind: (() => void) | null = null;

export const useSync = create<SyncStore>((set, get) => ({
  view: 'form',
  running: false,
  syncRunId: null,
  logs: [],
  steps: { ...PENDING_STEPS },
  progress: 0,
  stageLabel: 'Ready.',
  summary: null,
  failure: null,
  downloadedFile: null,

  _bindStream: () => {
    if (unbind) return;
    unbind = ipc.sync.onEvent((e) => get()._ingest(e));
  },

  start: async (input) => {
    get()._bindStream();
    set({
      view: 'processing',
      running: true,
      logs: [],
      steps: { ...PENDING_STEPS, 1: 'active' },
      progress: 6,
      stageLabel: SYNC_STEPS[0]?.desc ?? '',
      summary: null,
      failure: null,
      downloadedFile: null,
      syncRunId: null,
    });
    try {
      const { syncRunId } = await ipc.sync.start(input);
      set({ syncRunId });
    } catch (err) {
      set({
        view: 'failure',
        running: false,
        failure: { code: 'RG-INT-001', message: errorMessage(err) },
        steps: { ...PENDING_STEPS, 1: 'error' },
      });
    }
  },

  cancel: async () => {
    const id = get().syncRunId;
    if (id) {
      try {
        await ipc.sync.cancel(id);
      } catch {
        /* ignore */
      }
    }
    get().reset();
  },

  reset: () =>
    set({
      view: 'form',
      running: false,
      syncRunId: null,
      logs: [],
      steps: { ...PENDING_STEPS },
      progress: 0,
      stageLabel: 'Ready.',
      summary: null,
      failure: null,
      downloadedFile: null,
    }),

  _ingest: (e) => {
    const state = get();
    switch (e.type) {
      case 'log': {
        const fileMatch = e.message.match(/Report saved:\s*(.+)$/i);
        const next: Partial<SyncStore> = {
          logs: [...state.logs.slice(-400), { ts: e.ts, level: e.level, stage: e.stage, message: e.message }],
        };
        if (fileMatch?.[1]) next.downloadedFile = fileMatch[1].trim().replace(/^.*[\\/]/, '');
        set(next);
        break;
      }
      case 'phase': {
        const step = PHASE_TO_STEP[e.phase as keyof typeof PHASE_TO_STEP];
        if (step) {
          const steps = { ...state.steps };
          for (let i = 1; i < step; i++) steps[i] = 'done';
          if (steps[step] !== 'done') steps[step] = 'active';
          set({
            steps,
            progress: Math.max(state.progress, Math.floor((step / 6) * 90)),
            stageLabel: SYNC_STEPS[step - 1]?.desc ?? state.stageLabel,
          });
        }
        break;
      }
      case 'state': {
        if (e.state === SyncState.CANCELLED) {
          set({ running: false, view: 'form' });
        }
        break;
      }
      case 'done': {
        set({
          view: 'success',
          running: false,
          progress: 100,
          stageLabel: 'Reconciliation complete.',
          summary: e.summary,
          steps: { 1: 'done', 2: 'done', 3: 'done', 4: 'done', 5: 'done', 6: 'done' },
        });
        break;
      }
      case 'error': {
        const steps = { ...state.steps };
        for (const k of Object.keys(steps)) {
          const n = Number(k);
          if (steps[n] === 'active') steps[n] = 'error';
        }
        set({
          view: 'failure',
          running: false,
          failure: { code: e.code, message: e.message },
          steps,
        });
        break;
      }
    }
  },
}));
