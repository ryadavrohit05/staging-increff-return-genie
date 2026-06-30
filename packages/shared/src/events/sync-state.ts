/**
 * Sync lifecycle state machine.
 *
 * `SyncState` is the coarse, persisted state (stored on SyncRun in Postgres and
 * driven over Supabase Realtime). `SyncPhase` is the fine-grained, UI-facing
 * phase carried in live log events — these mirror the reference implementation's
 * `myntra:*` / `n8n:*` markers so the existing console UX is preserved.
 */

export const SyncState = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  DOWNLOADING: 'DOWNLOADING',
  PROCESSING: 'PROCESSING',
  UPLOADING: 'UPLOADING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type SyncState = (typeof SyncState)[keyof typeof SyncState];

export const TERMINAL_STATES: ReadonlySet<SyncState> = new Set([
  SyncState.SUCCEEDED,
  SyncState.FAILED,
  SyncState.CANCELLED,
]);

export function isTerminal(state: SyncState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Fine-grained phases. Preserved verbatim from the reference automation so the
 * desktop timeline can map them to step numbers exactly as before.
 */
export const SyncPhase = {
  // Automation (local, Playwright)
  MYNTRA_STARTING: 'myntra:starting',
  MYNTRA_LOGGING_IN: 'myntra:logging-in',
  // MANUAL_LOGIN: waiting for the user to sign in by hand and reach the report page.
  MYNTRA_AWAITING_MANUAL_LOGIN: 'myntra:awaiting-manual-login',
  MYNTRA_AUTHENTICATED: 'myntra:authenticated',
  MYNTRA_FILLING_FORM: 'myntra:filling-form',
  MYNTRA_SETTING_DATES: 'myntra:setting-dates',
  MYNTRA_GENERATING: 'myntra:generating',
  MYNTRA_WAITING_REPORT: 'myntra:waiting-report',
  MYNTRA_DOWNLOADING: 'myntra:downloading',
  MYNTRA_SAVED: 'myntra:saved',
  // Processing (backend)
  PROC_RECONSTRUCT: 'processing:reconstruct',
  PROC_VALIDATE: 'processing:validate',
  PROC_UPLOAD: 'processing:upload',
  PROC_RECONCILE: 'processing:reconcile',
  DONE: 'done',
} as const;

export type SyncPhase = (typeof SyncPhase)[keyof typeof SyncPhase];

/** UI timeline mapping (6 steps, identical semantics to the reference dashboard). */
export const PHASE_TO_STEP: Record<SyncPhase, number> = {
  [SyncPhase.MYNTRA_STARTING]: 1,
  [SyncPhase.MYNTRA_LOGGING_IN]: 1,
  [SyncPhase.MYNTRA_AWAITING_MANUAL_LOGIN]: 1,
  [SyncPhase.MYNTRA_AUTHENTICATED]: 1,
  [SyncPhase.MYNTRA_FILLING_FORM]: 2,
  [SyncPhase.MYNTRA_SETTING_DATES]: 2,
  [SyncPhase.MYNTRA_GENERATING]: 2,
  [SyncPhase.MYNTRA_WAITING_REPORT]: 2,
  [SyncPhase.MYNTRA_DOWNLOADING]: 2,
  [SyncPhase.MYNTRA_SAVED]: 3,
  [SyncPhase.PROC_RECONSTRUCT]: 4,
  [SyncPhase.PROC_VALIDATE]: 4,
  [SyncPhase.PROC_UPLOAD]: 5,
  [SyncPhase.PROC_RECONCILE]: 5,
  [SyncPhase.DONE]: 6,
};

export const SYNC_STEPS: ReadonlyArray<{ num: number; title: string; desc: string }> = [
  { num: 1, title: 'Connect to Marketplace', desc: 'Authenticating with fresh credentials.' },
  { num: 2, title: 'Generate & Download Report', desc: 'Filling filters and capturing the report.' },
  { num: 3, title: 'Report Downloaded', desc: 'Report captured and uploaded securely.' },
  { num: 4, title: 'Reconstruct & Validate', desc: 'Normalizing rows and validating data.' },
  { num: 5, title: 'Upload Return Orders', desc: 'Syncing return expectations to the upload API.' },
  { num: 6, title: 'Finalize Summary', desc: 'Reconciliation complete — results ready.' },
];
