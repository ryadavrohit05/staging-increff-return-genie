import { Router, type Request, type Response } from 'express';
import {
  DeviceRegisterInput,
  HeartbeatInput,
  AppError,
  ErrorCode,
  type DeviceInfo,
} from '@rg/shared';
import { asyncHandler } from '../../middleware/error.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireTenant, ctxOf } from '../../middleware/tenant.js';
import { prisma } from '../../lib/prisma.js';
import { loadOrgLicense } from '../licenses/license.service.js';

export const devicesRouter = Router();
devicesRouter.use(requireAuth, requireTenant);

function toDeviceInfo(d: {
  id: string;
  fingerprint: string;
  hostname: string;
  os: string;
  appVersion: string;
  status: 'ACTIVE' | 'REVOKED';
  lastHeartbeat: Date | null;
  registeredAt: Date;
}): DeviceInfo {
  return {
    id: d.id,
    fingerprint: d.fingerprint,
    hostname: d.hostname,
    os: d.os,
    appVersion: d.appVersion,
    status: d.status,
    lastHeartbeat: d.lastHeartbeat?.toISOString() ?? null,
    registeredAt: d.registeredAt.toISOString(),
  };
}

// POST /devices/register — register this machine; enforce maxDevices.
devicesRouter.post(
  '/register',
  validateBody(DeviceRegisterInput),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const input = req.body as DeviceRegisterInput;

    const existing = await prisma.device.findUnique({
      where: { orgId_fingerprint: { orgId: ctx.orgId, fingerprint: input.fingerprint } },
    });

    if (existing) {
      if (existing.status === 'REVOKED') throw new AppError(ErrorCode.LIC_DEVICE_REVOKED);
      const updated = await prisma.device.update({
        where: { id: existing.id },
        data: {
          hostname: input.hostname,
          os: input.os,
          appVersion: input.appVersion,
          lastHeartbeat: new Date(),
        },
      });
      res.json(toDeviceInfo(updated));
      return;
    }

    // New device → enforce the license device cap.
    const { license } = await loadOrgLicense(ctx.orgId);
    const activeCount = await prisma.device.count({
      where: { orgId: ctx.orgId, status: 'ACTIVE' },
    });
    if (activeCount >= license.maxDevices) throw new AppError(ErrorCode.LIC_DEVICE_LIMIT);

    const created = await prisma.device.create({
      data: {
        orgId: ctx.orgId,
        userId: ctx.userId,
        fingerprint: input.fingerprint,
        hostname: input.hostname,
        os: input.os,
        appVersion: input.appVersion,
        lastHeartbeat: new Date(),
      },
    });
    res.status(201).json(toDeviceInfo(created));
  }),
);

// POST /devices/heartbeat — liveness ping.
devicesRouter.post(
  '/heartbeat',
  validateBody(HeartbeatInput),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const input = req.body as HeartbeatInput;
    const device = await prisma.device.findUnique({
      where: { orgId_fingerprint: { orgId: ctx.orgId, fingerprint: input.fingerprint } },
    });
    if (!device) throw new AppError(ErrorCode.LIC_NOT_FOUND, 'Device not registered');
    if (device.status === 'REVOKED') throw new AppError(ErrorCode.LIC_DEVICE_REVOKED);

    await prisma.device.update({
      where: { id: device.id },
      data: { lastHeartbeat: new Date(), appVersion: input.appVersion },
    });
    res.status(204).end();
  }),
);

// GET /devices — list this org's devices.
devicesRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const devices = await prisma.device.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { registeredAt: 'desc' },
    });
    res.json({ items: devices.map(toDeviceInfo) });
  }),
);

// POST /devices/:id/revoke — org OWNER/ADMIN may revoke a device in their org.
devicesRouter.post(
  '/:id/revoke',
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const id = req.params.id as string;
    const device = await prisma.device.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!device) throw new AppError(ErrorCode.LIC_NOT_FOUND, 'Device not found');
    const updated = await prisma.device.update({
      where: { id: device.id },
      data: { status: 'REVOKED' },
    });
    res.json(toDeviceInfo(updated));
  }),
);
