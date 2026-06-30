import { z } from 'zod';
import { Marketplace } from './common.js';

/**
 * Marketplace credential input. This shape NEVER travels to the backend — it is
 * handled only inside the Electron main process and persisted to the OS keystore.
 */
export const CredentialInput = z.object({
  marketplace: Marketplace,
  label: z.string().min(1).max(80),
  email: z.string().min(1),
  password: z.string().min(1),
});
export type CredentialInput = z.infer<typeof CredentialInput>;

/** Non-secret status the renderer (and, via credRef only, the backend) may see. */
export const CredentialStatus = z.object({
  marketplace: Marketplace,
  label: z.string(),
  configured: z.boolean(),
  lastUsedAt: z.string().datetime().nullable(),
});
export type CredentialStatus = z.infer<typeof CredentialStatus>;
