/**
 * Public entry point for the automation engine.
 *
 * `runAutomation` is a HARD CONTRACT consumed by the desktop app's utility
 * process. It launches a stealthed browser, selects the marketplace adapter,
 * wires the AbortSignal to cancellation, guarantees browser cleanup, maps any
 * failure to an `AppError` with the right `ErrorCode`, and emits `phase` / `log`
 * / `screenshot` events throughout.
 */

import { AppError, ErrorCode, SyncPhase } from '@rg/shared';
import { launchBrowser } from './engine/browser.js';
import {
  clearSecrets,
  createLogger,
  registerSecrets,
  type AutomationEvent,
} from './engine/logger.js';
import { myntraAdapter } from './marketplaces/myntra/adapter.js';
import { flipkartAdapter } from './marketplaces/flipkart/adapter.js';
import type { AdapterJob, MarketplaceAdapter } from './marketplaces/types.js';

export interface AutomationJob {
  syncRunId: string;
  marketplace: 'MYNTRA' | 'FLIPKART';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  credentials: { email: string; password: string };
  headless?: boolean; // default false (headful so client watches)
  downloadDir: string; // absolute path provided by caller
  screenshotDir: string; // absolute path for failure snapshots
  proxyUrl?: string;
  signal?: AbortSignal; // for cancellation
}

export interface AutomationResult {
  reportPath: string; // absolute path to the downloaded report
  filename: string;
  downloadedAt: string; // ISO
}

export type { AutomationEvent } from './engine/logger.js';

const ADAPTERS: Record<AutomationJob['marketplace'], MarketplaceAdapter> = {
  MYNTRA: myntraAdapter,
  FLIPKART: flipkartAdapter,
};

/** Map an arbitrary thrown value to a typed AppError with an automation code. */
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const message = err instanceof Error ? err.message : String(err);

  // Playwright surfaces crashes/closures with recognizable messages.
  if (/Target closed|browser has been closed|crashed|Target page, context or browser/i.test(message)) {
    return new AppError(ErrorCode.AUTO_BROWSER_CRASH, message, err);
  }

  return new AppError(ErrorCode.AUTO_UNKNOWN, message, err);
}

/**
 * Run a full marketplace sync (download a report).
 *
 * @throws {AppError} with one of the AUTO_* codes on failure.
 */
export async function runAutomation(
  job: AutomationJob,
  onEvent: (e: AutomationEvent) => void,
): Promise<AutomationResult> {
  const stage = job.marketplace === 'MYNTRA' ? '[Myntra]' : '[Flipkart]';
  const log = createLogger(stage, onEvent);

  // Register secrets up front so nothing in any log line can leak them.
  registerSecrets(job.credentials.email, job.credentials.password);

  const adapter = ADAPTERS[job.marketplace];
  if (!adapter) {
    clearSecrets();
    throw new AppError(ErrorCode.AUTO_UNKNOWN, `Unknown marketplace: ${job.marketplace}`);
  }

  // Bail early if already cancelled.
  if (job.signal?.aborted) {
    clearSecrets();
    throw new AppError(ErrorCode.AUTO_CANCELLED, 'Sync was cancelled.');
  }

  log.info(`Launching browser (${job.headless ? 'headless' : 'headful'}, stealthed)...`);

  const { browser, context } = await launchBrowser({
    headless: job.headless ?? false,
    downloadDir: job.downloadDir,
    proxyUrl: job.proxyUrl,
  });

  // Wire cancellation: aborting tears down the browser, which makes any in-flight
  // Playwright call reject — the adapter's throwIfAborted converts that cleanly.
  const onAbort = (): void => {
    log.warn('Cancellation requested — closing browser');
    void context.close().catch(() => {});
    void browser.close().catch(() => {});
  };
  job.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const page = await context.newPage();

    const adapterJob: AdapterJob = {
      syncRunId: job.syncRunId,
      startDate: job.startDate,
      endDate: job.endDate,
      email: job.credentials.email,
      password: job.credentials.password,
      downloadDir: job.downloadDir,
      screenshotDir: job.screenshotDir,
      signal: job.signal,
    };

    const result = await adapter.run(page, adapterJob, onEvent);

    // Final milestone — report saved locally (ARCHITECTURE.md §15).
    onEvent({ type: 'phase', ts: Date.now(), phase: SyncPhase.MYNTRA_SAVED });
    log.info(`Report saved: ${result.filename}`);

    return result;
  } catch (err) {
    // If we were cancelled, prefer the cancellation code regardless of the
    // underlying "target closed" error the teardown produced.
    if (job.signal?.aborted) {
      throw new AppError(ErrorCode.AUTO_CANCELLED, 'Sync was cancelled.');
    }
    throw toAppError(err);
  } finally {
    job.signal?.removeEventListener('abort', onAbort);
    // Guaranteed cleanup regardless of success/failure.
    try {
      await context.close();
    } catch {
      /* ignore */
    }
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
    clearSecrets();
  }
}
