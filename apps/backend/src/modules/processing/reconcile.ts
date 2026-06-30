import Papa from 'papaparse';
import type { RowStatus } from '@rg/shared';
import { prisma } from '../../lib/prisma.js';
import { uploadArtifact, artifactPath } from '../../services/storage.js';

export interface ReconcileTotals {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

/**
 * Full per-order outcome — every field that was sent to CIMS plus the result and
 * the CIMS response/message. This is exactly what the downloadable results CSV
 * contains so the user has a complete, auditable record of the sync.
 */
export interface RowOutcome {
  channelOrderId: string;
  channelReturnOrderId: string;
  channelSku: string;
  returnOrderType: string;
  trackingId: string;
  quantity: number;
  reasonForReturn: string | null;
  status: RowStatus;
  /** CIMS error / skip reason; null for a clean success. */
  error: string | null;
}

/** Human-facing CIMS response text per status. */
function cimsResponse(o: RowOutcome): string {
  if (o.status === 'SUCCESS') return 'Created in CIMS';
  return o.error ?? '';
}

/**
 * Persist per-row outcomes, write the DETAILED results CSV to Storage, and roll
 * totals onto the SyncRun. Returns the totals so the processor can pick the final
 * state (partial success ends SUCCEEDED).
 */
export async function reconcile(params: {
  orgId: string;
  syncRunId: string;
  outcomes: RowOutcome[];
}): Promise<ReconcileTotals> {
  const { orgId, syncRunId, outcomes } = params;

  // Persist result rows (replace any prior rows for idempotent retries).
  await prisma.$transaction([
    prisma.syncResult.deleteMany({ where: { syncRunId } }),
    prisma.syncResult.createMany({
      data: outcomes.map((o) => ({
        syncRunId,
        orderId: o.channelOrderId || o.channelReturnOrderId || 'BLANK',
        status: o.status,
        error: o.error,
      })),
    }),
  ]);

  const totals: ReconcileTotals = {
    total: outcomes.length,
    success: outcomes.filter((o) => o.status === 'SUCCESS').length,
    failed: outcomes.filter((o) => o.status === 'FAILED').length,
    skipped: outcomes.filter((o) => o.status === 'SKIPPED').length,
  };

  // Detailed results CSV → Storage (results/<org>/<run>/results.csv).
  // Mirrors the CIMS upload template columns + the per-order outcome & response.
  const csv = Papa.unparse(
    outcomes.map((o) => ({
      channelOrderId: o.channelOrderId,
      channelReturnOrderId: o.channelReturnOrderId,
      channelSku: o.channelSku,
      returnOrderType: o.returnOrderType,
      trackingId: o.trackingId,
      quantity: o.quantity,
      reasonForReturn: o.reasonForReturn ?? '',
      status: o.status,
      cimsResponse: cimsResponse(o),
    })),
    { header: true },
  );
  const path = artifactPath(orgId, syncRunId, 'results.csv');
  await uploadArtifact('results', path, Buffer.from(csv, 'utf8'), 'text/csv');

  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: {
      resultPath: path,
      totalRows: totals.total,
      successRows: totals.success,
      failedRows: totals.failed,
      skippedRows: totals.skipped,
    },
  });

  return totals;
}
