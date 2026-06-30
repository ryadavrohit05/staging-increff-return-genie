import { z } from 'zod';
import { DateString, Marketplace, RowStatus, LogLevel } from './common.js';

export const SyncStartInput = z.object({
  marketplace: Marketplace,
  startDate: DateString,
  endDate: DateString,
});
export type SyncStartInput = z.infer<typeof SyncStartInput>;

export const SyncStartResult = z.object({
  syncRunId: z.string().uuid(),
});
export type SyncStartResult = z.infer<typeof SyncStartResult>;

/** Live event streamed from automation worker -> main -> renderer (IPC). */
export const SyncEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('log'),
    syncRunId: z.string().uuid(),
    ts: z.number().int(),
    level: LogLevel,
    stage: z.string(), // myntra | processing | upload | system
    message: z.string(),
  }),
  z.object({
    type: z.literal('phase'),
    syncRunId: z.string().uuid(),
    ts: z.number().int(),
    phase: z.string(), // SyncPhase value
  }),
  z.object({
    type: z.literal('state'),
    syncRunId: z.string().uuid(),
    ts: z.number().int(),
    state: z.string(), // SyncState value
  }),
  z.object({
    type: z.literal('done'),
    syncRunId: z.string().uuid(),
    ts: z.number().int(),
    summary: z.object({
      total: z.number().int(),
      success: z.number().int(),
      failed: z.number().int(),
      skipped: z.number().int(),
    }),
  }),
  z.object({
    type: z.literal('error'),
    syncRunId: z.string().uuid(),
    ts: z.number().int(),
    code: z.string(),
    message: z.string(),
    screenshotKey: z.string().nullable().optional(),
  }),
]);
export type SyncEvent = z.infer<typeof SyncEvent>;

export const SyncSummary = z.object({
  id: z.string().uuid(),
  marketplace: Marketplace,
  startDate: DateString,
  endDate: DateString,
  state: z.string(),
  phase: z.string().nullable(),
  totalRows: z.number().int().nullable(),
  successRows: z.number().int().nullable(),
  failedRows: z.number().int().nullable(),
  skippedRows: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  screenshotKey: z.string().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
});
export type SyncSummary = z.infer<typeof SyncSummary>;

export const SyncResultRow = z.object({
  orderId: z.string(),
  status: RowStatus,
  error: z.string().nullable(),
});
export type SyncResultRow = z.infer<typeof SyncResultRow>;

/** Multipart upload of the raw downloaded report to the backend. */
export const ReportUploadMeta = z.object({
  syncRunId: z.string().uuid(),
  marketplace: Marketplace,
  filename: z.string(),
  downloadedAt: z.string().datetime(),
});
export type ReportUploadMeta = z.infer<typeof ReportUploadMeta>;
