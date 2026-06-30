import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  SyncStartInput,
  ReportUploadMeta,
  AppError,
  ErrorCode,
  SyncState,
  isTerminal,
  type SyncSummary,
  type SyncResultRow,
  type SyncState as SyncStateType,
} from '@rg/shared';
import { asyncHandler } from '../../middleware/error.js';
import { validateBody, validateQuery, validatedQuery } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireTenant, ctxOf } from '../../middleware/tenant.js';
import { requireActiveLicense } from '../../middleware/license.js';
import { prisma } from '../../lib/prisma.js';
import { uploadArtifact, artifactPath, signedUrl } from '../../services/storage.js';
import { enqueueProcessReport } from '../../jobs/index.js';
import { logSync } from './sync-log.js';

export const syncRouter = Router();
syncRouter.use(requireAuth, requireTenant);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB cap for raw reports
});

const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
type PaginationQuery = z.infer<typeof PaginationQuery>;

function toSummary(r: {
  id: string;
  marketplace: 'MYNTRA' | 'FLIPKART';
  startDate: string;
  endDate: string;
  state: string;
  phase: string | null;
  totalRows: number | null;
  successRows: number | null;
  failedRows: number | null;
  skippedRows: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  screenshotKey: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}): SyncSummary {
  return {
    id: r.id,
    marketplace: r.marketplace,
    startDate: r.startDate,
    endDate: r.endDate,
    state: r.state,
    phase: r.phase,
    totalRows: r.totalRows,
    successRows: r.successRows,
    failedRows: r.failedRows,
    skippedRows: r.skippedRows,
    errorCode: r.errorCode,
    errorMessage: r.errorMessage,
    screenshotKey: r.screenshotKey,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

/** Load a run scoped to the caller's org or throw 404. */
async function getOwnedRun(req: Request, id: string) {
  const ctx = ctxOf(req);
  const run = await prisma.syncRun.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!run) throw new AppError(ErrorCode.LIC_NOT_FOUND, 'Sync run not found');
  return run;
}

// POST /sync/runs — create a QUEUED run (license-gated).
syncRouter.post(
  '/runs',
  requireActiveLicense,
  validateBody(SyncStartInput),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const input = req.body as SyncStartInput;

    // Resolve the caller's most-recent active device for attribution.
    const device = await prisma.device.findFirst({
      where: { orgId: ctx.orgId, userId: ctx.userId, status: 'ACTIVE' },
      orderBy: { lastHeartbeat: 'desc' },
    });
    if (!device) throw new AppError(ErrorCode.LIC_DEVICE_REVOKED, 'No active device registered');

    const run = await prisma.syncRun.create({
      data: {
        orgId: ctx.orgId,
        userId: ctx.userId,
        deviceId: device.id,
        marketplace: input.marketplace,
        startDate: input.startDate,
        endDate: input.endDate,
        state: SyncState.QUEUED,
      },
    });
    res.status(201).json({ syncRunId: run.id });
  }),
);

// POST /sync/runs/:id/report — multipart upload of the raw report; enqueue processing.
syncRouter.post(
  '/runs/:id/report',
  requireActiveLicense,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const id = req.params.id as string;
    const run = await getOwnedRun(req, id);

    if (isTerminal(run.state as SyncStateType)) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Run already finished');
    }
    if (!req.file) throw new AppError(ErrorCode.VALIDATION_FAILED, "Missing 'file' upload");

    // The multipart text fields carry ReportUploadMeta.
    const meta = ReportUploadMeta.parse({
      syncRunId: id,
      marketplace: req.body.marketplace,
      filename: req.body.filename ?? req.file.originalname,
      downloadedAt: req.body.downloadedAt ?? new Date().toISOString(),
    });

    // Store raw report → Storage reports/<org>/<run>/<filename>.
    const path = artifactPath(ctx.orgId, id, meta.filename);
    await uploadArtifact(
      'report',
      path,
      req.file.buffer,
      req.file.mimetype || 'text/csv',
    );

    await prisma.syncRun.update({
      where: { id },
      data: { reportPath: path, state: SyncState.PROCESSING },
    });
    await logSync(id, 'INFO', 'system', `Report received (${req.file.size} bytes), queued for processing`);

    await enqueueProcessReport({
      syncRunId: id,
      orgId: ctx.orgId,
      marketplace: meta.marketplace,
      reportPath: path,
      filename: meta.filename,
    });

    res.status(202).json({ syncRunId: id, state: SyncState.PROCESSING });
  }),
);

// GET /sync/runs — paginated history for the org.
syncRouter.get(
  '/runs',
  validateQuery(PaginationQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const { page, pageSize } = validatedQuery<PaginationQuery>(req);
    const [items, total] = await Promise.all([
      prisma.syncRun.findMany({
        where: { orgId: ctx.orgId },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.syncRun.count({ where: { orgId: ctx.orgId } }),
    ]);
    res.json({ items: items.map(toSummary), total, page, pageSize });
  }),
);

// GET /sync/runs/:id — single run detail.
syncRouter.get(
  '/runs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const run = await getOwnedRun(req, req.params.id as string);
    res.json(toSummary(run));
  }),
);

// GET /sync/runs/:id/logs?after=<iso> — incremental backend processing log lines
// so the desktop can show a LIVE trace of what the pipeline is doing.
syncRouter.get(
  '/runs/:id/logs',
  asyncHandler(async (req: Request, res: Response) => {
    const run = await getOwnedRun(req, req.params.id as string);
    const after = typeof req.query.after === 'string' ? new Date(req.query.after) : null;
    const logs = await prisma.syncLog.findMany({
      where: { syncRunId: run.id, ...(after && !isNaN(after.getTime()) ? { ts: { gt: after } } : {}) },
      orderBy: { ts: 'asc' },
      take: 500,
    });
    res.json({
      items: logs.map((l) => ({
        ts: l.ts.toISOString(),
        level: l.level,
        stage: l.stage,
        message: l.message,
      })),
    });
  }),
);

// GET /sync/runs/:id/results — per-row results.
syncRouter.get(
  '/runs/:id/results',
  asyncHandler(async (req: Request, res: Response) => {
    const run = await getOwnedRun(req, req.params.id as string);
    const rows = await prisma.syncResult.findMany({ where: { syncRunId: run.id } });
    const out: SyncResultRow[] = rows.map((r) => ({
      orderId: r.orderId,
      status: r.status,
      error: r.error,
    }));
    res.json({ items: out });
  }),
);

// POST /sync/runs/:id/retry-failed — re-enqueue only FAILED rows.
syncRouter.post(
  '/runs/:id/retry-failed',
  requireActiveLicense,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const run = await getOwnedRun(req, req.params.id as string);
    if (!run.reportPath) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Run has no stored report');

    const failedCount = await prisma.syncResult.count({
      where: { syncRunId: run.id, status: 'FAILED' },
    });
    if (failedCount === 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 'No failed rows to retry');

    await prisma.syncRun.update({
      where: { id: run.id },
      data: { state: SyncState.PROCESSING, attempt: { increment: 1 }, finishedAt: null, errorCode: null, errorMessage: null },
    });

    await enqueueProcessReport({
      syncRunId: run.id,
      orgId: ctx.orgId,
      marketplace: run.marketplace,
      reportPath: run.reportPath,
      filename: run.reportPath.split('/').pop() ?? 'report.csv',
      retryFailedOnly: true,
    });

    res.status(202).json({ syncRunId: run.id, retrying: failedCount });
  }),
);

// POST /sync/runs/:id/cancel — cancel a non-terminal run.
syncRouter.post(
  '/runs/:id/cancel',
  asyncHandler(async (req: Request, res: Response) => {
    const run = await getOwnedRun(req, req.params.id as string);
    if (isTerminal(run.state as SyncStateType)) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Run already finished');
    }
    const updated = await prisma.syncRun.update({
      where: { id: run.id },
      data: { state: SyncState.CANCELLED, finishedAt: new Date() },
    });
    await logSync(run.id, 'WARN', 'system', 'Run cancelled by user');
    res.json(toSummary(updated));
  }),
);

// GET /sync/runs/:id/artifact/:kind — signed Storage URL for report|results|screenshot.
// Only per-run artifacts here (NOT 'release', which is a global installer).
type RunArtifactKind = 'report' | 'results' | 'screenshot';
const ARTIFACT_KEY: Record<RunArtifactKind, 'reportPath' | 'resultPath' | 'screenshotKey'> = {
  report: 'reportPath',
  results: 'resultPath',
  screenshot: 'screenshotKey',
};

syncRouter.get(
  '/runs/:id/artifact/:kind',
  asyncHandler(async (req: Request, res: Response) => {
    const run = await getOwnedRun(req, req.params.id as string);
    const kind = req.params.kind as RunArtifactKind;
    if (!(kind in ARTIFACT_KEY)) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Unknown artifact kind');

    const key = run[ARTIFACT_KEY[kind]];
    if (!key) throw new AppError(ErrorCode.LIC_NOT_FOUND, `No ${kind} artifact for this run`);

    const url = await signedUrl(kind, key, 300);
    res.json({ url, expiresIn: 300 });
  }),
);
