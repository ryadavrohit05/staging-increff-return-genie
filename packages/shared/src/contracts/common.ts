import { z } from 'zod';

export const Marketplace = z.enum(['MYNTRA', 'FLIPKART']);
export type Marketplace = z.infer<typeof Marketplace>;

export const Role = z.enum(['SUPERADMIN', 'OWNER', 'ADMIN', 'MEMBER']);
export type Role = z.infer<typeof Role>;

export const OrgStatus = z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']);
export type OrgStatus = z.infer<typeof OrgStatus>;

export const LicenseStatus = z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']);
export type LicenseStatus = z.infer<typeof LicenseStatus>;

/**
 * How the desktop automation authenticates with the marketplace before report
 * generation:
 *  - AUTO_LOGIN: the browser logs in automatically with stored credentials
 *    (the original/Adidas behavior).
 *  - MANUAL_LOGIN: the browser opens the login page and waits for the user to
 *    sign in by hand; automation resumes once the Seller Returns Report page is
 *    detected. Everything after that point is identical to AUTO_LOGIN.
 */
export const AutomationMode = z.enum(['AUTO_LOGIN', 'MANUAL_LOGIN']);
export type AutomationMode = z.infer<typeof AutomationMode>;

/**
 * Which Increff platform the tenant's CIMS lives on — determines the
 * `authDomainName` suffix derived from the client slug:
 *   ICC   → "{slug}-omni"
 *   PROXY → "{slug}-oltp"
 */
export const CimsPlatform = z.enum(['ICC', 'PROXY']);
export type CimsPlatform = z.infer<typeof CimsPlatform>;

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
