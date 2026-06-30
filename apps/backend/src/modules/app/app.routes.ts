import { Router, type Request, type Response } from 'express';
import {
  AppError,
  ErrorCode,
  type ReleaseInfo,
  type DownloadTicket,
  type OrgConfigView,
} from '@rg/shared';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireTenant, ctxOf } from '../../middleware/tenant.js';
import { prisma } from '../../lib/prisma.js';
import { signedUrl } from '../../services/storage.js';
import { evaluateLicense } from '../licenses/license.service.js';

/**
 * Client-facing app distribution endpoints (mounted at /api/v1/app).
 *
 * The desktop installer lives in a PRIVATE Storage bucket. Any authenticated
 * user can see the latest release info; only an authenticated user with an
 * ACTIVE license (or a SUPERADMIN) can obtain a short-lived signed download URL.
 */
export const appRouter = Router();
appRouter.use(requireAuth);

/** Most recent AppVersion that actually has an uploaded installer binary. */
function latestInstaller() {
  return prisma.appVersion.findFirst({
    where: { installerKey: { not: null } },
    orderBy: { releasedAt: 'desc' },
  });
}

// GET /app/org-config — the caller's NON-SECRET per-org runtime config.
// The desktop reads this to decide AUTO_LOGIN vs MANUAL_LOGIN. It NEVER returns
// CIMS credentials, clientId, or dbId — those stay server-side.
appRouter.get(
  '/org-config',
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { id: true, slug: true, name: true, automationMode: true },
    });
    if (!org) throw new AppError(ErrorCode.LIC_NOT_FOUND, 'Organization not found');
    const view: OrgConfigView = {
      orgId: org.id,
      slug: org.slug,
      name: org.name,
      automationMode: org.automationMode,
    };
    res.json(view);
  }),
);

// GET /app/version/latest — latest installer release info (any authed user).
appRouter.get(
  '/version/latest',
  asyncHandler(async (_req: Request, res: Response) => {
    const v = await latestInstaller();
    const info: ReleaseInfo = v
      ? {
          version: v.version,
          available: !!v.installerKey,
          fileName: v.installerName,
          sizeBytes: v.installerSize,
          releaseNotes: v.releaseNotes,
          releasedAt: v.releasedAt.toISOString(),
        }
      : { version: '', available: false, fileName: null, sizeBytes: null, releaseNotes: null, releasedAt: null };
    res.json(info);
  }),
);

// GET /app/download — gated signed URL to the installer.
appRouter.get(
  '/download',
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = req.ctx;
    if (!ctx) throw new AppError(ErrorCode.AUTH_TOKEN_INVALID);

    // Client users must have an active org + license; SUPERADMIN bypasses.
    if (ctx.role !== 'SUPERADMIN') {
      await evaluateLicense({ orgId: ctx.orgId }, { throwOnBlock: true });
    }

    const v = await latestInstaller();
    if (!v?.installerKey) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'No installer is available yet.');
    }

    // installerKey can be either a Supabase storage path or a full external URL
    // (e.g. https://github.com/.../releases/download/v1.0/app.exe).
    const isExternalUrl = v.installerKey.startsWith('https://') || v.installerKey.startsWith('http://');
    const url = isExternalUrl
      ? v.installerKey
      : await signedUrl('release', v.installerKey, 300);
    const ticket: DownloadTicket = {
      url,
      fileName: v.installerName ?? `ReturnGenie-Setup-${v.version}.exe`,
      expiresIn: isExternalUrl ? 86400 : 300,
    };
    res.json(ticket);
  }),
);
