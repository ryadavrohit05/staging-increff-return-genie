import type { LogLevel } from '@rg/shared';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

/**
 * Append a structured log line to a SyncRun. Persisted to `sync_logs` (which the
 * desktop subscribes to via Realtime) and mirrored to the server logger. Stages:
 * myntra | processing | upload | system.
 */
export async function logSync(
  syncRunId: string,
  level: LogLevel,
  stage: string,
  message: string,
): Promise<void> {
  try {
    await prisma.syncLog.create({ data: { syncRunId, level, stage, message } });
  } catch (err) {
    logger.error({ err, syncRunId }, 'failed to persist sync log');
  }
  logger[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'info'](
    { syncRunId, stage },
    message,
  );
}
