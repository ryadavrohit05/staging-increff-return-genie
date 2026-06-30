import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export interface AuditEntry {
  actorId: string;
  action: string; // e.g. "org.create", "license.update", "device.revoke"
  orgId?: string | null;
  target?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Write an AuditLog row. Called for EVERY mutating admin action (§9). Failures
 * are logged but never block the primary operation — audit is best-effort and
 * must not make a successful admin mutation appear to fail.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        orgId: entry.orgId ?? null,
        target: entry.target ?? null,
        meta: (entry.meta ?? undefined) as object | undefined,
      },
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, 'failed to write audit log');
  }
}
