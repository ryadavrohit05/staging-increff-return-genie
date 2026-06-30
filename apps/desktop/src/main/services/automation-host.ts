/**
 * Automation host (ARCHITECTURE.md §4, §15).
 *
 * Orchestrates a single sync run:
 *   1. POST /sync/runs → syncRunId
 *   2. utilityProcess.fork the automation worker
 *   3. pass the job + credentials over the fork message (in-memory; never on disk)
 *   4. relay worker AutomationEvents → renderer via CH.SYNC_EVENT
 *   5. on AutomationResult, upload the report to POST /sync/runs/:id/report
 *   6. poll GET /sync/runs/:id for backend processing status → forward state/done
 *   7. handle cancel (kill worker), crash (exit != 0), and cleanup
 *
 * Realtime upgrade: step 6 polling can be replaced with Supabase Realtime on
 * sync_runs/sync_logs (see services/realtime.ts) — polling is used for simplicity.
 */
import { app, utilityProcess, type UtilityProcess, type WebContents } from 'electron';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { readFile } from 'node:fs/promises';
import {
  AppError,
  ErrorCode,
  SyncState,
  SyncPhase,
  isTerminal,
  type SyncEvent,
  type SyncStartInput,
  type SyncSummary,
} from '@rg/shared';
import { CH } from '@rg/shared';
import { config } from '../config.js';
import { apiClient } from './api-client.js';
import { loadCred, markUsed } from './keystore.js';
import { downloadDir, screenshotDir } from './paths.js';
import { createLog } from './logger.js';
import type {
  SerializableJob,
  WorkerInbound,
  WorkerOutbound,
} from '../automation-worker.js';

const log = createLog('automation-host');

interface ActiveRun {
  syncRunId: string;
  marketplace: SyncStartInput['marketplace'];
  child: UtilityProcess;
  pollTimer: NodeJS.Timeout | null;
  cancelled: boolean;
  uploaded: boolean;
}

let active: ActiveRun | null = null;

/** Resolve the built worker path next to this module's compiled output. */
function workerPath(): string {
  // Both index.js and automation-worker.js are emitted into out/main/.
  return join(__dirname, 'automation-worker.js');
}

function emit(target: WebContents, event: SyncEvent): void {
  if (!target.isDestroyed()) target.send(CH.SYNC_EVENT, event);
}

/** Map a SyncPhase string to the coarse SyncState for state events. */
function phaseToState(phase: string): SyncState | null {
  if (phase === SyncPhase.MYNTRA_SAVED) return SyncState.DOWNLOADING;
  if (phase.startsWith('myntra:')) return SyncState.RUNNING;
  if (phase === SyncPhase.PROC_RECONSTRUCT || phase === SyncPhase.PROC_VALIDATE)
    return SyncState.PROCESSING;
  if (phase === SyncPhase.PROC_UPLOAD || phase === SyncPhase.PROC_RECONCILE)
    return SyncState.UPLOADING;
  if (phase === SyncPhase.DONE) return SyncState.SUCCEEDED;
  return null;
}

/** Upload the downloaded report to the backend (multipart). */
async function uploadReport(
  syncRunId: string,
  marketplace: SyncStartInput['marketplace'],
  reportPath: string,
  filename: string,
  downloadedAt: string,
): Promise<void> {
  const bytes = await readFile(reportPath);
  const form = new FormData();
  form.append('file', new Blob([bytes]), filename);
  form.append('syncRunId', syncRunId);
  form.append('marketplace', marketplace);
  form.append('filename', filename);
  form.append('downloadedAt', downloadedAt);
  await apiClient.postForm(`/sync/runs/${syncRunId}/report`, form);
}

interface BackendLog {
  ts: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  stage: string;
  message: string;
}

/** Poll backend processing status (and live logs) until the run is terminal. */
function startPolling(run: ActiveRun, target: WebContents): void {
  let lastLogTs: string | null = null;

  // Fetch + stream any new backend log lines so the desktop shows a LIVE trace
  // of the server-side pipeline (reconstruct → Webget dedup → CIMS submit).
  const pullLogs = async (): Promise<void> => {
    try {
      const q = lastLogTs ? `?after=${encodeURIComponent(lastLogTs)}` : '';
      const { items } = await apiClient.get<{ items: BackendLog[] }>(
        `/sync/runs/${run.syncRunId}/logs${q}`,
      );
      for (const l of items) {
        lastLogTs = l.ts;
        emit(target, {
          type: 'log',
          syncRunId: run.syncRunId,
          ts: Date.parse(l.ts) || Date.now(),
          level: l.level,
          stage: l.stage,
          message: l.message,
        });
      }
    } catch {
      /* logs are best-effort; never break the status poll */
    }
  };

  const tick = async (): Promise<void> => {
    if (run.cancelled) return;
    try {
      await pullLogs();
      const summary = await apiClient.get<SyncSummary>(`/sync/runs/${run.syncRunId}`);
      emit(target, {
        type: 'state',
        syncRunId: run.syncRunId,
        ts: Date.now(),
        state: summary.state,
      });
      if (summary.phase) {
        emit(target, {
          type: 'phase',
          syncRunId: run.syncRunId,
          ts: Date.now(),
          phase: summary.phase,
        });
      }

      if (isTerminal(summary.state as SyncState)) {
        await pullLogs(); // flush any final reconcile/summary log lines
        stopPolling(run);
        if (summary.state === SyncState.SUCCEEDED) {
          emit(target, {
            type: 'done',
            syncRunId: run.syncRunId,
            ts: Date.now(),
            summary: {
              total: summary.totalRows ?? 0,
              success: summary.successRows ?? 0,
              failed: summary.failedRows ?? 0,
              skipped: summary.skippedRows ?? 0,
            },
          });
        } else {
          emit(target, {
            type: 'error',
            syncRunId: run.syncRunId,
            ts: Date.now(),
            code: summary.errorCode ?? ErrorCode.PROC_UPLOAD_FAILED,
            message: summary.errorMessage ?? 'Processing failed.',
            screenshotKey: summary.screenshotKey,
          });
        }
        cleanup(run);
      }
    } catch (err) {
      // Transient polling failures are non-fatal; keep trying until terminal.
      log.warn('Status poll failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  };
  run.pollTimer = setInterval(() => void tick(), config.syncPollIntervalMs);
}

function stopPolling(run: ActiveRun): void {
  if (run.pollTimer) {
    clearInterval(run.pollTimer);
    run.pollTimer = null;
  }
}

function cleanup(run: ActiveRun): void {
  stopPolling(run);
  try {
    run.child.kill();
  } catch {
    /* already gone */
  }
  if (active?.syncRunId === run.syncRunId) active = null;
}

/** Wire all worker → host message handling. */
function attachWorker(run: ActiveRun, job: SerializableJob, target: WebContents): void {
  run.child.on('message', (raw: WorkerOutbound) => {
    void handleWorkerMessage(run, raw, target);
  });

  run.child.on('exit', (code) => {
    if (run.cancelled) return;
    // Non-zero exit before the report uploaded ⇒ worker crash (§15 crash recovery).
    if (!run.uploaded && code !== 0) {
      emit(target, {
        type: 'error',
        syncRunId: run.syncRunId,
        ts: Date.now(),
        code: ErrorCode.AUTO_BROWSER_CRASH,
        message: `Automation worker exited unexpectedly (code ${code}).`,
        screenshotKey: null,
      });
      markRunFailed(run.syncRunId, ErrorCode.AUTO_BROWSER_CRASH);
      cleanup(run);
    }
  });

  // Kick off the run.
  run.child.postMessage({ kind: 'start', job } satisfies WorkerInbound);
}

async function handleWorkerMessage(
  run: ActiveRun,
  msg: WorkerOutbound,
  target: WebContents,
): Promise<void> {
  switch (msg.kind) {
    case 'event': {
      const e = msg.event;
      if (e.type === 'log') {
        emit(target, {
          type: 'log',
          syncRunId: run.syncRunId,
          ts: e.ts,
          level: e.level,
          stage: e.stage,
          message: e.message,
        });
      } else if (e.type === 'phase') {
        emit(target, {
          type: 'phase',
          syncRunId: run.syncRunId,
          ts: e.ts,
          phase: e.phase,
        });
        const state = phaseToState(e.phase);
        if (state) {
          emit(target, { type: 'state', syncRunId: run.syncRunId, ts: e.ts, state });
        }
      } else if (e.type === 'screenshot') {
        emit(target, {
          type: 'log',
          syncRunId: run.syncRunId,
          ts: e.ts,
          level: 'WARN',
          stage: 'system',
          message: `Captured failure screenshot.`,
        });
      }
      break;
    }

    case 'result': {
      run.uploaded = true;
      emit(target, {
        type: 'log',
        syncRunId: run.syncRunId,
        ts: Date.now(),
        level: 'INFO',
        stage: 'system',
        message: `Report downloaded (${msg.result.filename}); uploading…`,
      });
      try {
        await uploadReport(
          run.syncRunId,
          run.marketplace,
          msg.result.reportPath,
          msg.result.filename,
          msg.result.downloadedAt,
        );
        await markUsed(run.marketplace);
        emit(target, {
          type: 'state',
          syncRunId: run.syncRunId,
          ts: Date.now(),
          state: SyncState.PROCESSING,
        });
        // Worker's job is done; backend takes over. Begin polling for results.
        try {
          run.child.kill();
        } catch {
          /* ignore */
        }
        startPolling(run, target);
      } catch (err) {
        const code = err instanceof AppError ? err.code : ErrorCode.PROC_UPLOAD_FAILED;
        const message = err instanceof Error ? err.message : 'Report upload failed.';
        emit(target, {
          type: 'error',
          syncRunId: run.syncRunId,
          ts: Date.now(),
          code,
          message,
          screenshotKey: null,
        });
        cleanup(run);
      }
      break;
    }

    case 'error': {
      // Try to surface the most recent failure screenshot path (best-effort).
      let shotKey: string | null = null;
      try {
        const files = await fs.readdir(msg.screenshotDir);
        const png = files.find((f) => f.endsWith('.png'));
        if (png) shotKey = join(msg.screenshotDir, png);
      } catch {
        /* none */
      }
      emit(target, {
        type: 'error',
        syncRunId: run.syncRunId,
        ts: Date.now(),
        code: msg.code,
        message: msg.message,
        screenshotKey: shotKey,
      });
      markRunFailed(run.syncRunId, msg.code);
      cleanup(run);
      break;
    }
  }
}

/**
 * Record that the local automation leg failed. The run was never uploaded, so
 * the backend reconciles any run left RUNNING past its timeout → FAILED (§15
 * crash recovery). We only log here; no spurious API call is made.
 */
function markRunFailed(syncRunId: string, code: string): void {
  log.warn('Local automation leg failed', { syncRunId, code });
}

/**
 * Start a sync run. Returns the syncRunId immediately after the worker is
 * spawned; live progress streams over CH.SYNC_EVENT.
 */
export async function startSync(
  input: SyncStartInput,
  target: WebContents,
): Promise<{ syncRunId: string }> {
  if (active) {
    throw new AppError(ErrorCode.VALIDATION_FAILED, 'A sync is already running.');
  }

  // 1. Load marketplace credentials (in-memory only).
  const credentials = await loadCred(input.marketplace);

  // 2. Create the backend run record.
  const { syncRunId } = await apiClient.post<{ syncRunId: string }>('/sync/runs', input);

  // 3. Build the (serializable) job.
  const job: SerializableJob = {
    syncRunId,
    marketplace: input.marketplace,
    startDate: input.startDate,
    endDate: input.endDate,
    credentials,
    downloadDir: downloadDir(syncRunId),
    screenshotDir: screenshotDir(syncRunId),
  };

  // 4. Fork the utility process.
  // When packaged, Chromium is bundled at resources/pw-browsers (see
  // electron-builder.yml extraResources). Point Playwright at it so it never
  // needs a separate `playwright install` on the client machine. In dev, leave
  // PLAYWRIGHT_BROWSERS_PATH unset so the local ms-playwright cache is used.
  const workerEnv: Record<string, string> = { ...process.env, HEADLESS: 'false' };
  if (app.isPackaged) {
    workerEnv['PLAYWRIGHT_BROWSERS_PATH'] = join(process.resourcesPath, 'pw-browsers');
  }

  const child = utilityProcess.fork(workerPath(), [], {
    serviceName: 'rg-automation',
    env: workerEnv,
  });

  const run: ActiveRun = {
    syncRunId,
    marketplace: input.marketplace,
    child,
    pollTimer: null,
    cancelled: false,
    uploaded: false,
  };
  active = run;

  emit(target, {
    type: 'state',
    syncRunId,
    ts: Date.now(),
    state: SyncState.RUNNING,
  });

  attachWorker(run, job, target);
  return { syncRunId };
}

/** Cancel the active run: kill the worker (closes Chromium) → CANCELLED. */
export async function cancelSync(syncRunId: string, target: WebContents): Promise<void> {
  if (!active || active.syncRunId !== syncRunId) return;
  active.cancelled = true;
  try {
    active.child.postMessage({ kind: 'cancel' } satisfies WorkerInbound);
  } catch {
    /* ignore */
  }
  emit(target, {
    type: 'state',
    syncRunId,
    ts: Date.now(),
    state: SyncState.CANCELLED,
  });
  cleanup(active);
}

/** Kill any active run on app quit. */
export function shutdownAutomation(): void {
  if (active) {
    active.cancelled = true;
    cleanup(active);
  }
}
