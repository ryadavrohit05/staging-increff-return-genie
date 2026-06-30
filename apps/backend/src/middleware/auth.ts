import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode, Role } from '@rg/shared';
import { env } from '../env.js';
import { JwtError, verifySupabaseJwt } from '../lib/jwt.js';
import type { RequestContext } from '../types/express.js';

const VALID_ROLES = new Set<string>(Role.options);

// Supabase publishes its asymmetric (ES256) signing keys here; the HMAC secret
// covers legacy projects. Both are passed to the verifier, which picks by `alg`.
const JWKS_URL = `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

/**
 * Verify the Supabase JWT and attach `req.ctx`.
 *
 * Tokens are verified locally: HS256 against SUPABASE_JWT_SECRET, or ES256/RS256
 * against the project JWKS (newer projects use asymmetric signing keys). `org_id`
 * and the platform `role` come from `app_metadata` (set by the admin module at
 * provisioning). SUPERADMIN is platform-level and cross-tenant, so it carries a
 * `role` but no `org_id` (see docs/SETUP.md §6). Any failure → AUTH_* → 401.
 *
 * Kept as a synchronous (req,res,next) middleware so all `.use(requireAuth)`
 * call sites are unchanged; the async verification is bridged via next().
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  authenticate(req).then(() => next(), next);
}

async function authenticate(req: Request): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, 'Missing bearer token');
  }
  const token = header.slice('Bearer '.length).trim();

  let claims;
  try {
    claims = await verifySupabaseJwt(token, {
      hmacSecret: env.SUPABASE_JWT_SECRET,
      jwksUrl: JWKS_URL,
    });
  } catch (err) {
    if (err instanceof JwtError && /expired/i.test(err.message)) {
      throw new AppError(ErrorCode.AUTH_TOKEN_EXPIRED);
    }
    throw new AppError(ErrorCode.AUTH_TOKEN_INVALID);
  }

  const orgId = claims.app_metadata?.org_id;
  const role = claims.app_metadata?.role;
  if (!role || !VALID_ROLES.has(role)) {
    throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, 'Token missing role in app_metadata');
  }
  // Tenant-scoped roles must carry an org_id; SUPERADMIN is cross-tenant.
  if (role !== 'SUPERADMIN' && !orgId) {
    throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, 'Token missing org_id in app_metadata');
  }

  const ctx: RequestContext = {
    userId: claims.sub,
    orgId: orgId ?? '',
    role: role as Role,
    email: claims.email ?? '',
  };
  req.ctx = ctx;
}

/** Role guard. SUPERADMIN always passes. */
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.ctx?.role;
    if (!role) throw new AppError(ErrorCode.AUTH_TOKEN_INVALID);
    if (role === 'SUPERADMIN' || allowed.includes(role)) {
      next();
      return;
    }
    throw new AppError(ErrorCode.AUTH_FORBIDDEN);
  };
}
