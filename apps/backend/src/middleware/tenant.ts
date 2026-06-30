import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode } from '@rg/shared';
import type { RequestContext } from '../types/express.js';

/**
 * Ensure a tenant context is present. Mount AFTER requireAuth on every tenant
 * route. The orgId here is the ONLY trusted source of tenancy — client-provided
 * orgId values are never honoured (ARCHITECTURE.md §7).
 */
export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.ctx?.orgId) {
    throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, 'No tenant context');
  }
  next();
}

/** Narrow accessor that throws if the context is somehow absent. */
export function ctxOf(req: Request): RequestContext {
  if (!req.ctx) throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, 'No request context');
  return req.ctx;
}

/**
 * Helper to build a tenant-scoped Prisma `where` clause. Every tenant query MUST
 * funnel its filter through this so orgId can never be omitted by accident.
 */
export function orgScope(req: Request): { orgId: string } {
  return { orgId: ctxOf(req).orgId };
}
