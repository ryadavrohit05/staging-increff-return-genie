import { AppError, ErrorCode, SyncPhase, SyncState, type RowStatus } from '@rg/shared';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { downloadArtifact } from '../../services/storage.js';
import { logSync } from '../sync/sync-log.js';
import type { ProcessReportJob } from '../../jobs/types.js';
import { reconstruct, type ReturnRow } from './reconstruct.js';
import { validateRows } from './validate.js';
import { fetchExistingOrderIds } from './webget.js';
import {
  resolveExternalConfig,
  uploadReturnOrders,
  uploadViaN8n,
  type UploadRowResult,
} from './external-api.js';
import { reconcile, type RowOutcome } from './reconcile.js';

/** Build a full per-order outcome row from a parsed ReturnRow + its result. */
function toOutcome(row: ReturnRow, status: RowStatus, error: string | null): RowOutcome {
  return {
    channelOrderId: row.sellerOrderId,
    channelReturnOrderId: row.channelReturnOrderId,
    channelSku: row.sellerSkuCode,
    returnOrderType: row.type.toUpperCase().includes('RTO') ? 'RETURN_TO_ORIGIN' : 'CUSTOMER_RETURN',
    trackingId: row.trackingId,
    quantity: row.quantity,
    reasonForReturn: row.returnReason,
    status,
    error: status === 'SUCCESS' ? null : error,
  };
}
import { env } from '../../env.js';

async function setStatePhase(syncRunId: string, state: SyncState, phase: string): Promise<void> {
  await prisma.syncRun.update({ where: { id: syncRunId }, data: { state, phase } });
}

/**
 * The processing pipeline (ARCHITECTURE.md §10) — a faithful port of the proven
 * n8n workflow, invoked by the pg-boss worker:
 *
 *   reconstruct (xlsx/csv) → validate (blank seller_order_id) →
 *   Webget dedup (skip orders already in CIMS) → submit each to CIMS → reconcile
 *
 * Partial success ends SUCCEEDED. Never re-downloads from the marketplace; on
 * retry-failed it re-submits only rows previously marked FAILED.
 */
export async function processReport(job: ProcessReportJob): Promise<void> {
  const { syncRunId, orgId, marketplace, reportPath, filename, retryFailedOnly } = job;

  try {
    // ── 1. reconstruct ──────────────────────────────────────────────────────
    await setStatePhase(syncRunId, SyncState.PROCESSING, SyncPhase.PROC_RECONSTRUCT);
    await logSync(syncRunId, 'INFO', 'processing', 'Reconstructing report rows');
    const buffer = await downloadArtifact('report', reportPath);

    // Transitional n8n path: hand the whole file to n8n, parse its results CSV.
    if (env.N8N_WEBHOOK_URL) {
      await setStatePhase(syncRunId, SyncState.UPLOADING, SyncPhase.PROC_UPLOAD);
      await logSync(syncRunId, 'INFO', 'upload', 'Uploading report via n8n (transitional path)');
      const uploaded = await uploadViaN8n(buffer, filename, marketplace);
      const n8nOutcomes: RowOutcome[] = uploaded.map((u) => ({
        channelOrderId: u.orderId,
        channelReturnOrderId: '',
        channelSku: '',
        returnOrderType: '',
        trackingId: '',
        quantity: 1,
        reasonForReturn: null,
        status: u.status,
        error: u.error,
      }));
      await finalize(orgId, syncRunId, n8nOutcomes);
      return;
    }

    const cfg = await resolveExternalConfig(orgId);
    const allRows = reconstruct(buffer, marketplace, filename);
    await logSync(syncRunId, 'INFO', 'processing', `Parsed ${allRows.length} rows`);

    // ── 2. validate (blank seller_order_id → skipped) ───────────────────────
    await setStatePhase(syncRunId, SyncState.PROCESSING, SyncPhase.PROC_VALIDATE);
    const { valid, invalid } = validateRows(allRows);

    // ── 3. Webget dedup — skip orders already in CIMS ───────────────────────
    const existing = await fetchExistingOrderIds(
      valid.map((r) => r.sellerOrderId),
      cfg.webget,
    );
    const dedupSkippedRows = valid.filter((r) => existing.has(r.sellerOrderId));
    let toSubmit: ReturnRow[] = valid.filter((r) => !existing.has(r.sellerOrderId));
    await logSync(
      syncRunId,
      'INFO',
      'processing',
      `Classified: ${toSubmit.length} to submit, ${dedupSkippedRows.length} already in CIMS, ${invalid.length} invalid`,
    );

    // On retry-failed, restrict the submit set to rows that previously FAILED.
    if (retryFailedOnly) {
      const failed = await prisma.syncResult.findMany({
        where: { syncRunId, status: 'FAILED' },
        select: { orderId: true },
      });
      const failedIds = new Set(failed.map((f) => f.orderId));
      toSubmit = toSubmit.filter((r) => failedIds.has(r.sellerOrderId));
      await logSync(syncRunId, 'INFO', 'upload', `Retrying ${toSubmit.length} previously-failed rows`);
    }

    // ── 4. submit to CIMS ───────────────────────────────────────────────────
    await setStatePhase(syncRunId, SyncState.UPLOADING, SyncPhase.PROC_UPLOAD);
    await logSync(syncRunId, 'INFO', 'upload', `Submitting ${toSubmit.length} return orders to CIMS`);
    const uploaded: UploadRowResult[] = await uploadReturnOrders(toSubmit, cfg);

    // ── build full per-order outcomes (for the detailed results CSV) ─────────
    const resultByOrderId = new Map(uploaded.map((u) => [u.orderId, u]));
    const outcomes: RowOutcome[] = [
      // submitted rows → their CIMS result
      ...toSubmit.map((r) => {
        const res = resultByOrderId.get(r.sellerOrderId);
        return toOutcome(r, res?.status ?? 'FAILED', res?.error ?? 'No response from CIMS');
      }),
      // already-in-CIMS rows → skipped
      ...dedupSkippedRows.map((r) => toOutcome(r, 'SKIPPED', 'Already exists in CIMS')),
      // invalid rows → skipped with reason
      ...invalid.map((iv) => toOutcome(iv.row, 'SKIPPED', iv.reasons.join('; '))),
    ];

    await finalize(orgId, syncRunId, outcomes);
  } catch (err) {
    await failRun(syncRunId, err);
    throw err; // surface to pg-boss for its own retry/visibility
  }
}

/** Reconcile + pick the terminal state. Partial success → SUCCEEDED. */
async function finalize(orgId: string, syncRunId: string, outcomes: RowOutcome[]): Promise<void> {
  await setStatePhase(syncRunId, SyncState.PROCESSING, SyncPhase.PROC_RECONCILE);
  await logSync(syncRunId, 'INFO', 'processing', 'Reconciling results');

  const totals = await reconcile({ orgId, syncRunId, outcomes });

  const attempted = totals.success + totals.failed;
  const hardFail = attempted > 0 && totals.success === 0 && totals.failed > 0;

  const finalState = hardFail ? SyncState.FAILED : SyncState.SUCCEEDED;
  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: {
      state: finalState,
      phase: SyncPhase.DONE,
      finishedAt: new Date(),
      ...(hardFail
        ? { errorCode: ErrorCode.PROC_UPLOAD_FAILED, errorMessage: 'All rows failed to upload' }
        : totals.failed > 0
          ? { errorCode: ErrorCode.PROC_PARTIAL_FAILURE, errorMessage: `${totals.failed} rows failed` }
          : {}),
    },
  });

  await logSync(
    syncRunId,
    hardFail ? 'ERROR' : totals.failed > 0 ? 'WARN' : 'INFO',
    'system',
    `Done: total=${totals.total} success=${totals.success} failed=${totals.failed} skipped=${totals.skipped}`,
  );
}

async function failRun(syncRunId: string, err: unknown): Promise<void> {
  const code = err instanceof AppError ? err.code : ErrorCode.INTERNAL;
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ err, syncRunId }, 'processing pipeline failed');
  try {
    await prisma.syncRun.update({
      where: { id: syncRunId },
      data: { state: SyncState.FAILED, phase: SyncPhase.DONE, finishedAt: new Date(), errorCode: code, errorMessage: message },
    });
    await logSync(syncRunId, 'ERROR', 'system', `Pipeline failed: ${message}`);
  } catch (updateErr) {
    logger.error({ err: updateErr, syncRunId }, 'failed to mark run failed');
  }
}
