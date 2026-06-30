import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode } from '@rg/shared';
import { logger } from '../lib/logger.js';

/** Map a canonical error code to an HTTP status. */
function statusForCode(code: string): number {
  if (code.startsWith('RG-AUTH')) {
    return code === ErrorCode.AUTH_FORBIDDEN ? 403 : 401;
  }
  if (code === ErrorCode.LIC_NOT_FOUND) return 404;
  if (code.startsWith('RG-LIC') || code === ErrorCode.APP_UPDATE_REQUIRED) return 403;
  if (code === ErrorCode.VALIDATION_FAILED) return 400;
  if (code === ErrorCode.RATE_LIMITED) return 429;
  if (code === ErrorCode.PROC_EXTERNAL_API_DOWN) return 502;
  return 500;
}

/** 404 handler for unmatched routes. Mount before the error handler. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: ErrorCode.INTERNAL, message: 'Not found', details: undefined },
  });
}

/**
 * Terminal error middleware. Converts AppError / ZodError / unknown into the
 * canonical `{ error: { code, message, details } }` envelope with the right HTTP
 * status, and logs via pino (secrets already redacted at the serializer).
 *
 * Express identifies this as an error handler by its 4-arg signature.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = new AppError(ErrorCode.VALIDATION_FAILED, 'Invalid request', err.flatten());
  } else if (err instanceof Error) {
    appError = new AppError(ErrorCode.INTERNAL, undefined, undefined);
  } else {
    appError = new AppError(ErrorCode.INTERNAL);
  }

  const status = statusForCode(appError.code);

  // 5xx are unexpected → log full error; 4xx are client faults → log at warn.
  const logPayload = {
    err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
    code: appError.code,
    path: req.path,
    method: req.method,
    orgId: req.ctx?.orgId,
    userId: req.ctx?.userId,
  };
  if (status >= 500) logger.error(logPayload, 'request failed');
  else logger.warn(logPayload, 'request rejected');

  res.status(status).json({
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
    },
  });
}

/**
 * Wrap an async route handler so thrown/rejected errors reach the error
 * middleware (Express 4 does not catch async rejections automatically).
 */
export function asyncHandler<
  H extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
>(handler: H) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
