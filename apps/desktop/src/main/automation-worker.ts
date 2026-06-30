/**
 * Automation utility-process entry (ARCHITECTURE.md §4).
 *
 * Spawned via `utilityProcess.fork`. It receives the job (including credentials)
 * over the parent port message IN MEMORY — credentials are never written to disk
 * or logged here. It imports `@rg/automation` and forwards every AutomationEvent
 * back to the parent, then posts a final `result` or `error` message.
 *
 * This file is bundled as a SEPARATE main-process entry by electron-vite (it is
 * referenced by automation-host.ts via its built path).
 */
import { AppError, ErrorCode } from '@rg/shared';
import { runAutomation, type AutomationEvent, type AutomationJob } from '@rg/automation';

/** Message shapes exchanged with the parent (automation-host.ts). */
export type WorkerInbound =
  | { kind: 'start'; job: SerializableJob }
  | { kind: 'cancel' };

export type WorkerOutbound =
  | { kind: 'event'; event: AutomationEvent }
  | { kind: 'result'; result: { reportPath: string; filename: string; downloadedAt: string } }
  | { kind: 'error'; code: string; message: string; screenshotDir: string };

/** The job without the non-serializable AbortSignal (recreated worker-side). */
export type SerializableJob = Omit<AutomationJob, 'signal'>;

/**
 * `process.parentPort` is injected by Electron's utilityProcess runtime and is
 * not in @types/node, so we narrow it locally rather than redeclaring `process`.
 */
interface ParentPort {
  on(event: 'message', cb: (e: { data: WorkerInbound }) => void): void;
  postMessage(message: WorkerOutbound): void;
}
const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort;

const abort = new AbortController();

function post(msg: WorkerOutbound): void {
  parentPort.postMessage(msg);
}

async function start(job: SerializableJob): Promise<void> {
  // Headful is mandatory so the client can watch the real browser (§15).
  const fullJob: AutomationJob = { ...job, headless: false, signal: abort.signal };

  try {
    const result = await runAutomation(fullJob, (event: AutomationEvent) => {
      post({ kind: 'event', event });
    });
    post({ kind: 'result', result });
  } catch (err) {
    const appErr =
      err instanceof AppError
        ? err
        : new AppError(
            ErrorCode.AUTO_UNKNOWN,
            err instanceof Error ? err.message : String(err),
          );
    post({
      kind: 'error',
      code: appErr.code,
      message: appErr.message,
      screenshotDir: job.screenshotDir,
    });
  }
}

parentPort.on('message', (e) => {
  const msg = e.data;
  if (msg.kind === 'start') {
    void start(msg.job);
  } else if (msg.kind === 'cancel') {
    abort.abort();
  }
});
