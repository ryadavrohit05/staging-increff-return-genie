import type { NextFunction, Request, Response } from 'express';
import { ZodError, z, type ZodTypeAny } from 'zod';
import { AppError, ErrorCode } from '@rg/shared';

/**
 * Body validator. On success the parsed value replaces `req.body`. On failure a
 * VALIDATION_FAILED AppError is thrown carrying the flattened zod issues; the
 * error middleware converts it to a 400.
 */
export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body) as z.infer<S>;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        throw new AppError(ErrorCode.VALIDATION_FAILED, 'Invalid request body', err.flatten());
      }
      throw err;
    }
  };
}

/** Query-string validator. Parsed result is stored on `req.validatedQuery`. */
export function validateQuery<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      (req as Request & { validatedQuery: z.infer<S> }).validatedQuery = schema.parse(
        req.query,
      ) as z.infer<S>;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        throw new AppError(ErrorCode.VALIDATION_FAILED, 'Invalid query parameters', err.flatten());
      }
      throw err;
    }
  };
}

/** Read the validated query (set by `validateQuery`). */
export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}
