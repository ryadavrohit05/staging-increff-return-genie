import { Router, type Request, type Response } from 'express';
import { LicenseValidateInput } from '@rg/shared';
import { asyncHandler } from '../../middleware/error.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireTenant, ctxOf } from '../../middleware/tenant.js';
import { prisma } from '../../lib/prisma.js';
import { evaluateLicense } from './license.service.js';

export const licensesRouter = Router();
licensesRouter.use(requireAuth, requireTenant);

// POST /license/validate — full §8 evaluation incl. device + version gate.
// Auto-registers the device's heartbeat if known (does not create new devices —
// that is /devices/register, which enforces the cap).
licensesRouter.post(
  '/validate',
  validateBody(LicenseValidateInput),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const input = req.body as LicenseValidateInput;

    const device = await prisma.device.findUnique({
      where: { orgId_fingerprint: { orgId: ctx.orgId, fingerprint: input.fingerprint } },
    });

    const result = await evaluateLicense(
      { orgId: ctx.orgId, fingerprint: input.fingerprint, appVersion: input.appVersion },
      { throwOnBlock: false, knownDevice: device },
    );

    if (device && device.status === 'ACTIVE') {
      await prisma.device
        .update({
          where: { id: device.id },
          data: { lastHeartbeat: new Date(), appVersion: input.appVersion },
        })
        .catch(() => undefined);
    }

    res.json(result);
  }),
);

// GET /license/status — lightweight status without device/version specifics.
licensesRouter.get(
  '/status',
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const result = await evaluateLicense({ orgId: ctx.orgId }, { throwOnBlock: false });
    res.json(result);
  }),
);
