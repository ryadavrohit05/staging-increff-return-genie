import type { Role } from '@rg/shared';

/** Authenticated request context, attached by middleware/auth.ts. */
export interface RequestContext {
  userId: string;
  orgId: string;
  role: Role;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx?: RequestContext;
    }
  }
}

export {};
