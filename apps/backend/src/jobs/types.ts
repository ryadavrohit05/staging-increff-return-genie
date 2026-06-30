import type { Marketplace } from '@rg/shared';

export const QUEUE_PROCESS_REPORT = 'process-report';

/** Payload for a full report-processing job (reconstruct → validate → upload → reconcile). */
export interface ProcessReportJob {
  syncRunId: string;
  orgId: string;
  marketplace: Marketplace;
  reportPath: string; // Storage key in the reports bucket
  filename: string;
  /** When true, only re-upload rows that previously FAILED (retry-failed endpoint). */
  retryFailedOnly?: boolean;
}
