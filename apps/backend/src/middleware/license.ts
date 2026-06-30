import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode } from '@rg/shared';
import { ctxOf } from './tenant.js';
import { evaluateLicense } from '../modules/licenses/license.service.js';

/**
 * `requireActiveLicense` — server-side license gate enforced before every sync
 * (ARCHITECTURE.md §8). Loads org + license, checks status/expiry/version, and
 * raises a LIC_* / APP_UPDATE_REQUIRED AppError on any blocking condition.
 *
 * Device-limit/revoked checks happen at /devices/register and /license/validate;
 * this gate focuses on org+license+version so a sync cannot start under an
 * expired or suspended account or from a too-old client.
 */
export async function requireActiveLicense(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const { orgId } = ctxOf(req);
  const result = await evaluateLicense({ orgId }, { throwOnBlock: true });
  if (result.updateRequired) {
    throw new AppError(ErrorCode.APP_UPDATE_REQUIRED);
  }
  next();
}
