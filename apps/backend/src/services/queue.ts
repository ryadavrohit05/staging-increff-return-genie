import PgBoss from 'pg-boss';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';

/**
 * pg-boss job queue, backed by the same Postgres (ARCHITECTURE.md §10, §13 — no
 * Redis on the free tier). Uses the DIRECT_URL because pg-boss runs DDL/LISTEN
 * which the PgBouncer transaction pooler does not support.
 */
let boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  boss = new PgBoss({ connectionString: env.DIRECT_URL });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  await boss.start();
  logger.info('pg-boss started');
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true });
    boss = null;
  }
}
