import { Router, type Request, type Response } from 'express';
import { LoginInput, RefreshInput, AppError, ErrorCode, type SessionUser } from '@rg/shared';
import { asyncHandler } from '../../middleware/error.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { ctxOf } from '../../middleware/tenant.js';
import { prisma } from '../../lib/prisma.js';
import * as authService from './auth.service.js';

export const authRouter = Router();

// POST /auth/login — proxy the Supabase password grant.
authRouter.post(
  '/login',
  validateBody(LoginInput),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginInput;
    const result = await authService.login(email, password);
    res.json(result);
  }),
);

// POST /auth/refresh — rotate tokens.
authRouter.post(
  '/refresh',
  validateBody(RefreshInput),
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as RefreshInput;
    const tokens = await authService.refresh(refreshToken);
    res.json({ tokens });
  }),
);

// POST /auth/logout — revoke the current session.
authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const header = req.headers.authorization ?? '';
    await authService.logout(header.slice('Bearer '.length).trim());
    res.status(204).end();
  }),
);

// GET /auth/me — current session user.
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const org = await prisma.organization.findUnique({ where: { id: ctx.orgId } });
    if (!org) throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, 'Organization not found');

    // Touch last-seen (best-effort).
    await prisma.user
      .update({ where: { id: ctx.userId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    const user: SessionUser = {
      id: ctx.userId,
      email: ctx.email,
      orgId: ctx.orgId,
      orgName: org.name,
      role: ctx.role,
    };
    res.json({ user });
  }),
);
