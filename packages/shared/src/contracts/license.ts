import { z } from 'zod';
import { LicenseStatus } from './common.js';

export const LicenseValidateInput = z.object({
  fingerprint: z.string().min(8),
  hostname: z.string(),
  os: z.string(),
  appVersion: z.string(),
});
export type LicenseValidateInput = z.infer<typeof LicenseValidateInput>;

export const LicenseStatusResult = z.object({
  ok: z.boolean(),
  status: LicenseStatus,
  plan: z.string(),
  validUntil: z.string().datetime(),
  maxDevices: z.number().int().positive(),
  activeDevices: z.number().int().nonnegative(),
  /** Seconds the client may operate offline before hard-stopping. */
  offlineGraceSeconds: z.number().int().nonnegative(),
  /** Minimum supported app version; below this, client must update. */
  minSupportedVersion: z.string(),
  updateRequired: z.boolean(),
});
export type LicenseStatusResult = z.infer<typeof LicenseStatusResult>;
