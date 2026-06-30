import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../env.js';
import { compareSemver } from '../../lib/semver.js';

export const versionsRouter = Router();
versionsRouter.use(requireAuth);

// GET /versions/latest — newest published version on the stable channel.
versionsRouter.get(
  '/latest',
  asyncHandler(async (_req: Request, res: Response) => {
    const versions = await prisma.appVersion.findMany({ where: { channel: 'stable' } });
    versions.sort((a, b) => compareSemver(b.version, a.version));
    const latest = versions[0] ?? null;
    res.json({
      version: latest?.version ?? null,
      releaseNotes: latest?.releaseNotes ?? null,
      releasedAt: latest?.releasedAt.toISOString() ?? null,
    });
  }),
);

// GET /versions/min-supported — the forced-update floor (env + DB-flagged).
versionsRouter.get(
  '/min-supported',
  asyncHandler(async (_req: Request, res: Response) => {
    // Highest version explicitly flagged minSupported, else the env floor.
    const flagged = await prisma.appVersion.findMany({ where: { minSupported: true } });
    flagged.sort((a, b) => compareSemver(b.version, a.version));
    const dbFloor = flagged[0]?.version;
    const minSupported =
      dbFloor && compareSemver(dbFloor, env.MIN_SUPPORTED_VERSION) > 0
        ? dbFloor
        : env.MIN_SUPPORTED_VERSION;
    res.json({ minSupportedVersion: minSupported });
  }),
);
