import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import multer from 'multer';
import { $Enums } from '@prisma/client';
import {
  CreateOrgInput,
  UpdateOrgStatusInput,
  UpdateLicenseInput,
  PublishVersionInput,
  PublishReleaseInput,
  ExternalApiConfigInput,
  AppError,
  ErrorCode,
  type OrgSummary,
  type SyncSummary,
  type ExternalApiConfigView,
} from '@rg/shared';
import { asyncHandler } from '../../middleware/error.js';
import { validateBody, validateQuery, validatedQuery } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { audit } from '../../services/audit.js';
import { signedUrl, uploadArtifact, createSignedUploadUrl } from '../../services/storage.js';

// Installer uploads can be large; allow up to 300 MB in memory.
const installerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } });
import { encryptSecret } from '../../lib/crypto.js';
import {
  invalidateExternalConfig,
  hostFromClient,
  domainFromClient,
} from '../processing/external-api.js';
import { env } from '../../env.js';

export const adminRouter = Router();
// All admin routes are SUPERADMIN-only (cross-tenant).
adminRouter.use(requireAuth, requireRole('SUPERADMIN'));

const Pagination = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
type Pagination = z.infer<typeof Pagination>;

// Licensing is not used operationally. New clients get a non-expiring license so
// the (still-present) sync gate always passes — onboarding never asks for a plan
// or an expiry date.
const DEFAULT_PLAN = 'standard';
const NEVER_EXPIRES = new Date('9999-12-31T23:59:59.000Z');

function actorId(req: Request): string {
  return req.ctx?.userId ?? 'unknown';
}

// ── POST /admin/orgs — create org + license + OWNER user (Supabase admin) ─────
adminRouter.post(
  '/orgs',
  validateBody(CreateOrgInput),
  asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateOrgInput;

    const existing = await prisma.organization.findUnique({ where: { slug: input.slug } });
    if (existing) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Slug already in use');

    // 1. Create the org + license atomically.
    const orgId = crypto.randomUUID();
    await prisma.$transaction([
      prisma.organization.create({
        data: { id: orgId, name: input.name, slug: input.slug, maxDevices: input.maxDevices },
      }),
      prisma.license.create({
        data: {
          orgId,
          plan: DEFAULT_PLAN,
          maxDevices: input.maxDevices,
          validUntil: NEVER_EXPIRES,
        },
      }),
    ]);

    // 2. Provision the OWNER in Supabase Auth with app_metadata org_id/role.
    //    The password is chosen by the super-admin at creation.
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: input.ownerEmail,
      password: input.password,
      email_confirm: true,
      app_metadata: { org_id: orgId, role: 'OWNER' },
    });
    if (error || !data.user) {
      // Roll back the org/license so we don't strand a half-created tenant.
      await prisma.license.deleteMany({ where: { orgId } });
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
      throw new AppError(ErrorCode.INTERNAL, `Failed to create owner: ${error?.message ?? 'unknown'}`);
    }

    // 3. Mirror the user into our table.
    await prisma.user.create({
      data: { id: data.user.id, orgId, email: input.ownerEmail, role: 'OWNER' },
    });

    await audit({
      actorId: actorId(req),
      action: 'org.create',
      orgId,
      target: input.slug,
      meta: { ownerEmail: input.ownerEmail, plan: DEFAULT_PLAN },
    });

    res.status(201).json({ orgId, ownerUserId: data.user.id });
  }),
);

// ── GET /admin/orgs — paginated org summaries ─────────────────────────────────
adminRouter.get(
  '/orgs',
  validateQuery(Pagination),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, pageSize } = validatedQuery<Pagination>(req);
    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          licenses: { orderBy: { validUntil: 'desc' }, take: 1 },
          _count: { select: { users: true, devices: true } },
        },
      }),
      prisma.organization.count(),
    ]);

    const items: OrgSummary[] = orgs.map((o) => {
      const lic = o.licenses[0];
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        maxDevices: o.maxDevices,
        userCount: o._count.users,
        deviceCount: o._count.devices,
        license: lic
          ? { status: lic.status, plan: lic.plan, validUntil: lic.validUntil.toISOString() }
          : null,
        createdAt: o.createdAt.toISOString(),
      };
    });
    res.json({ items, total, page, pageSize });
  }),
);

// ── PATCH /admin/orgs/:id/status ──────────────────────────────────────────────
adminRouter.patch(
  '/orgs/:id/status',
  validateBody(UpdateOrgStatusInput),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { status } = req.body as UpdateOrgStatusInput;
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) throw new AppError(ErrorCode.LIC_NOT_FOUND, 'Org not found');
    await prisma.organization.update({ where: { id }, data: { status } });
    await audit({ actorId: actorId(req), action: 'org.status.update', orgId: id, meta: { status } });
    res.json({ id, status });
  }),
);

// ── PATCH /admin/orgs/:id/license ─────────────────────────────────────────────
adminRouter.patch(
  '/orgs/:id/license',
  validateBody(UpdateLicenseInput),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const input = req.body as UpdateLicenseInput;
    const license = await prisma.license.findFirst({
      where: { orgId: id },
      orderBy: { validUntil: 'desc' },
    });
    if (!license) throw new AppError(ErrorCode.LIC_NOT_FOUND, 'License not found');

    const updated = await prisma.license.update({
      where: { id: license.id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.plan ? { plan: input.plan } : {}),
        ...(input.maxDevices ? { maxDevices: input.maxDevices } : {}),
        ...(input.validUntil ? { validUntil: new Date(input.validUntil) } : {}),
      },
    });
    // Keep the org device cap in sync when the license cap changes.
    if (input.maxDevices) {
      await prisma.organization.update({ where: { id }, data: { maxDevices: input.maxDevices } });
    }
    await audit({ actorId: actorId(req), action: 'license.update', orgId: id, target: license.id, meta: { ...input } });
    res.json({
      id: updated.id,
      status: updated.status,
      plan: updated.plan,
      maxDevices: updated.maxDevices,
      validUntil: updated.validUntil.toISOString(),
    });
  }),
);

// ── GET /admin/orgs/:id/devices ───────────────────────────────────────────────
adminRouter.get(
  '/orgs/:id/devices',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const devices = await prisma.device.findMany({
      where: { orgId: id },
      orderBy: { registeredAt: 'desc' },
    });
    res.json({
      items: devices.map((d) => ({
        id: d.id,
        fingerprint: d.fingerprint,
        hostname: d.hostname,
        os: d.os,
        appVersion: d.appVersion,
        status: d.status,
        lastHeartbeat: d.lastHeartbeat?.toISOString() ?? null,
        registeredAt: d.registeredAt.toISOString(),
      })),
    });
  }),
);

// ── POST /admin/devices/:id/revoke ────────────────────────────────────────────
adminRouter.post(
  '/devices/:id/revoke',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) throw new AppError(ErrorCode.LIC_NOT_FOUND, 'Device not found');
    await prisma.device.update({ where: { id }, data: { status: 'REVOKED' } });
    await audit({ actorId: actorId(req), action: 'device.revoke', orgId: device.orgId, target: id });
    res.json({ id, status: 'REVOKED' });
  }),
);

// ── GET /admin/sync-runs — cross-tenant monitoring with filters ───────────────
const SyncRunFilter = Pagination.extend({
  orgId: z.string().uuid().optional(),
  state: z.nativeEnum($Enums.SyncState).optional(),
  marketplace: z.nativeEnum($Enums.Marketplace).optional(),
});
type SyncRunFilter = z.infer<typeof SyncRunFilter>;

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

adminRouter.get(
  '/sync-runs',
  validateQuery(SyncRunFilter),
  asyncHandler(async (req: Request, res: Response) => {
    const q = validatedQuery<SyncRunFilter>(req);
    const where = {
      ...(q.orgId ? { orgId: q.orgId } : {}),
      ...(q.state ? { state: q.state } : {}),
      ...(q.marketplace ? { marketplace: q.marketplace } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.syncRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.syncRun.count({ where }),
    ]);
    res.json({ items: items.map(toSummary), total, page: q.page, pageSize: q.pageSize });
  }),
);

// ── GET /admin/sync-runs/:id — detail with logs + results + screenshot URL ────
adminRouter.get(
  '/sync-runs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const run = await prisma.syncRun.findUnique({
      where: { id },
      include: { logs: { orderBy: { ts: 'asc' } }, results: true },
    });
    if (!run) throw new AppError(ErrorCode.LIC_NOT_FOUND, 'Run not found');

    let screenshotUrl: string | null = null;
    if (run.screenshotKey) {
      screenshotUrl = await signedUrl('screenshot', run.screenshotKey, 300).catch(() => null);
    }

    res.json({
      run: toSummary(run),
      logs: run.logs.map((l) => ({
        ts: l.ts.toISOString(),
        level: l.level,
        stage: l.stage,
        message: l.message,
      })),
      results: run.results.map((r) => ({ orderId: r.orderId, status: r.status, error: r.error })),
      screenshotUrl,
    });
  }),
);

// ── GET /admin/orgs/:id/external-api — config WITHOUT the password ────────────
adminRouter.get(
  '/orgs/:id/external-api',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const cfg = await prisma.externalApiConfig.findUnique({ where: { orgId: id } });
    if (!cfg) {
      res.json({ configured: false, config: null });
      return;
    }
    const view: ExternalApiConfigView = {
      clientSlug: cfg.clientSlug,
      baseUrl: hostFromClient(cfg.clientSlug),
      authDomainName: domainFromClient(cfg.clientSlug),
      authUsername: cfg.authUsername ?? env.EXTERNAL_API_USERNAME,
      returnOrdersPath: cfg.returnOrdersPath,
      passwordSet: cfg.authPasswordEnc.length > 0,
      updatedAt: cfg.updatedAt.toISOString(),
    };
    res.json({ configured: true, config: view });
  }),
);

// ── PUT /admin/orgs/:id/external-api — upsert per-org CIMS config (encrypted) ──
adminRouter.put(
  '/orgs/:id/external-api',
  validateBody(ExternalApiConfigInput),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const input = req.body as ExternalApiConfigInput;
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) throw new AppError(ErrorCode.LIC_NOT_FOUND, 'Org not found');

    const authPasswordEnc = encryptSecret(input.authPassword);
    await prisma.externalApiConfig.upsert({
      where: { orgId: id },
      create: {
        orgId: id,
        clientSlug: input.clientSlug,
        authUsername: input.authUsername ?? null,
        authPasswordEnc,
        returnOrdersPath: input.returnOrdersPath,
      },
      update: {
        clientSlug: input.clientSlug,
        authUsername: input.authUsername ?? null,
        authPasswordEnc,
        returnOrdersPath: input.returnOrdersPath,
      },
    });
    invalidateExternalConfig(id);

    // Audit WITHOUT the password.
    await audit({
      actorId: actorId(req),
      action: 'external-api.update',
      orgId: id,
      target: input.clientSlug,
      meta: { clientSlug: input.clientSlug, baseUrl: hostFromClient(input.clientSlug) },
    });
    res.json({ orgId: id, configured: true, baseUrl: hostFromClient(input.clientSlug) });
  }),
);

// ── POST /admin/versions — publish an AppVersion ──────────────────────────────
adminRouter.post(
  '/versions',
  validateBody(PublishVersionInput),
  asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as PublishVersionInput;
    const version = await prisma.appVersion.upsert({
      where: { version: input.version },
      create: {
        version: input.version,
        channel: input.channel,
        minSupported: input.minSupported,
        releaseNotes: input.releaseNotes ?? null,
      },
      update: {
        channel: input.channel,
        minSupported: input.minSupported,
        releaseNotes: input.releaseNotes ?? null,
      },
    });
    await audit({ actorId: actorId(req), action: 'version.publish', target: input.version, meta: { ...input } });
    res.status(201).json({ id: version.id, version: version.version });
  }),
);

// ── GET /admin/releases/upload-url — get a signed URL for direct browser upload ─
// This avoids routing the binary through this server (free tier: 512 MB RAM).
// Step 1: browser calls this to get a signed Supabase upload URL.
// Step 2: browser PUT the file directly to Supabase (no server RAM used).
// Step 3: browser calls POST /admin/releases/confirm to record the metadata.
const UploadUrlQuery = z.object({
  version: z.string().min(1),
  filename: z.string().min(1),
});
adminRouter.get(
  '/releases/upload-url',
  validateQuery(UploadUrlQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const { version, filename } = validatedQuery<z.infer<typeof UploadUrlQuery>>(req);
    const key = `installers/${version}/${filename}`;
    const { signedUrl: url, token } = await createSignedUploadUrl('release', key);
    res.json({ signedUrl: url, token, key });
  }),
);

// ── POST /admin/releases/confirm — record installer metadata after direct upload ─
const ConfirmReleaseInput = z.object({
  version: z.string().min(1),
  channel: z.enum(['stable', 'beta']).default('stable'),
  minSupported: z.boolean().default(false),
  releaseNotes: z.string().optional(),
  // installerKey can be either a Supabase storage path OR a full external URL
  // (e.g. https://github.com/.../releases/download/v1.0/app.exe)
  installerKey: z.string().min(1),
  installerName: z.string().min(1),
  installerSize: z.coerce.number().int().positive(),
});
adminRouter.post(
  '/releases/confirm',
  validateBody(ConfirmReleaseInput),
  asyncHandler(async (req: Request, res: Response) => {
    const input = ConfirmReleaseInput.parse(req.body);
    const version = await prisma.appVersion.upsert({
      where: { version: input.version },
      create: {
        version: input.version,
        channel: input.channel,
        minSupported: input.minSupported,
        releaseNotes: input.releaseNotes ?? null,
        installerKey: input.installerKey,
        installerName: input.installerName,
        installerSize: input.installerSize,
      },
      update: {
        channel: input.channel,
        minSupported: input.minSupported,
        releaseNotes: input.releaseNotes ?? null,
        installerKey: input.installerKey,
        installerName: input.installerName,
        installerSize: input.installerSize,
      },
    });
    await audit({
      actorId: actorId(req),
      action: 'release.publish',
      target: input.version,
      meta: { installerName: input.installerName, sizeBytes: input.installerSize, source: 'direct-upload' },
    });
    res.status(201).json({ id: version.id, version: version.version, installerName: input.installerName, sizeBytes: input.installerSize });
  }),
);

// ── POST /admin/releases — upload the desktop installer for a version ─────────
adminRouter.post(
  '/releases',
  installerUpload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError(ErrorCode.VALIDATION_FAILED, "Missing 'file' (installer) upload");
    const input = PublishReleaseInput.parse({
      version: req.body.version,
      channel: req.body.channel ?? 'stable',
      minSupported: req.body.minSupported ?? false,
      releaseNotes: req.body.releaseNotes,
    });

    // Store the binary in the private `releases` bucket under installers/<version>/.
    const installerName = req.file.originalname || `ReturnGenie-Setup-${input.version}.exe`;
    const key = `installers/${input.version}/${installerName}`;
    await uploadArtifact('release', key, req.file.buffer, 'application/octet-stream');

    const version = await prisma.appVersion.upsert({
      where: { version: input.version },
      create: {
        version: input.version,
        channel: input.channel,
        minSupported: input.minSupported,
        releaseNotes: input.releaseNotes ?? null,
        installerKey: key,
        installerName,
        installerSize: req.file.size,
      },
      update: {
        channel: input.channel,
        minSupported: input.minSupported,
        releaseNotes: input.releaseNotes ?? null,
        installerKey: key,
        installerName,
        installerSize: req.file.size,
      },
    });

    await audit({
      actorId: actorId(req),
      action: 'release.publish',
      target: input.version,
      meta: { installerName, sizeBytes: req.file.size, minSupported: input.minSupported },
    });
    res.status(201).json({ id: version.id, version: version.version, installerName, sizeBytes: req.file.size });
  }),
);

// ── GET /admin/audit — paginated audit log ────────────────────────────────────
const AuditFilter = Pagination.extend({ orgId: z.string().uuid().optional() });
type AuditFilter = z.infer<typeof AuditFilter>;

adminRouter.get(
  '/audit',
  validateQuery(AuditFilter),
  asyncHandler(async (req: Request, res: Response) => {
    const q = validatedQuery<AuditFilter>(req);
    const where = q.orgId ? { orgId: q.orgId } : {};
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { ts: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({
      items: items.map((a) => ({
        id: a.id,
        orgId: a.orgId,
        actorId: a.actorId,
        action: a.action,
        target: a.target,
        meta: a.meta,
        ts: a.ts.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    });
  }),
);
