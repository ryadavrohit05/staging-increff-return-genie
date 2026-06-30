import { z } from 'zod';

export const Marketplace = z.enum(['MYNTRA', 'FLIPKART']);
export type Marketplace = z.infer<typeof Marketplace>;

export const Role = z.enum(['SUPERADMIN', 'OWNER', 'ADMIN', 'MEMBER']);
export type Role = z.infer<typeof Role>;

export const OrgStatus = z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']);
export type OrgStatus = z.infer<typeof OrgStatus>;

export const LicenseStatus = z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']);
export type LicenseStatus = z.infer<typeof LicenseStatus>;

export const DeviceStatus = z.enum(['ACTIVE', 'REVOKED']);
export type DeviceStatus = z.infer<typeof DeviceStatus>;

export const RowStatus = z.enum(['SUCCESS', 'FAILED', 'SKIPPED']);
export type RowStatus = z.infer<typeof RowStatus>;

export const LogLevel = z.enum(['INFO', 'WARN', 'ERROR']);
export type LogLevel = z.infer<typeof LogLevel>;

/** YYYY-MM-DD */
export const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export type DateString = z.infer<typeof DateString>;

export const Paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
