import { getBoss } from '../services/queue.js';
import { logger } from '../lib/logger.js';
import { processReport } from '../modules/processing/processor.js';
import { QUEUE_PROCESS_REPORT, type ProcessReportJob } from './types.js';

/** Enqueue a report-processing job. Returns the pg-boss job id (may be null if deduped). */
export async function enqueueProcessReport(payload: ProcessReportJob): Promise<string | null> {
  const boss = await getBoss();
  // pg-boss v10 requires the queue to exist before send(); idempotent.
  await boss.createQueue(QUEUE_PROCESS_REPORT).catch(() => undefined);
  const jobId = await boss.send(QUEUE_PROCESS_REPORT, payload, {
    retryLimit: 2,
    retryBackoff: true,
    expireInMinutes: 60,
  });
  logger.info({ syncRunId: payload.syncRunId, jobId }, 'processing job enqueued');
  return jobId;
}

/**
 * Register pg-boss queues + workers. Called once at boot from index.ts. The
 * processing worker chains reconstruct → validate → upload → reconcile.
 */
export async function registerWorkers(): Promise<void> {
  const boss = await getBoss();

  // pg-boss v10: the queue MUST be created before work()/send() — otherwise jobs
  // are enqueued but never picked up (the run stays stuck in PROCESSING). Idempotent.
  await boss.createQueue(QUEUE_PROCESS_REPORT).catch((err) => {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'createQueue (already exists?)');
  });

  await boss.work<ProcessReportJob>(QUEUE_PROCESS_REPORT, async ([job]) => {
    if (!job) return;
    const { syncRunId } = job.data;
    logger.info({ syncRunId }, '▶ processing job picked up');
    try {
      await processReport(job.data);
      logger.info({ syncRunId }, '✔ processing job completed');
    } catch (err) {
      logger.error(
        { syncRunId, err: err instanceof Error ? err.message : String(err) },
        '✖ processing job failed',
      );
      throw err;
    }
  });

  logger.info({ queue: QUEUE_PROCESS_REPORT }, 'pg-boss workers registered');
}
