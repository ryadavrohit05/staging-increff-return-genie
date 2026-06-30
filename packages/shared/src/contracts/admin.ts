import { z } from 'zod';
import { OrgStatus, LicenseStatus, Role, AutomationMode, CimsPlatform } from './common.js';

export const CreateOrgInput = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  maxDevices: z.number().int().positive().default(2),
  ownerEmail: z.string().email(),
  // The super-admin sets the owner's login password directly at creation.
  password: z.string().min(8),

  // ── Tenant runtime configuration (multi-tenant) ──────────────────────────
  // These become the source of truth for the org's CIMS/Webget integration and
  // automation behavior. Provided once at onboarding; editable later via
  // PUT /admin/orgs/:id/external-api.
  //
  // CIMS client slug — drives baseUrl (https://{slug}.omni.increff.com) and the
  // authDomainName, whose suffix depends on the platform below.
  clientSlug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and hyphens only'),
  // Increff platform → authDomainName suffix: ICC ⇒ {slug}-omni, PROXY ⇒ {slug}-oltp.
  platform: CimsPlatform.default('PROXY'),
  // CIMS clientId — one org maps to exactly one clientId (never queried at runtime).
  cimsClientId: z.number().int().positive(),
  // Webget dbId — used for the dedup query AND the oms_sub_orders resolution.
  webgetDbId: z.number().int().positive(),
  // AUTO_LOGIN (Adidas-style) or MANUAL_LOGIN (default for new clients).
  automationMode: AutomationMode.default('MANUAL_LOGIN'),
});
export type CreateOrgInput = z.infer<typeof CreateOrgInput>;

export const OrgSummary = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: OrgStatus,
  maxDevices: z.number().int(),
  userCount: z.number().int(),
  deviceCount: z.number().int(),
  license: z
    .object({
      status: LicenseStatus,
      plan: z.string(),
      validUntil: z.string().datetime(),
    })
    .nullable(),
  createdAt: z.string().datetime(),
});
export type OrgSummary = z.infer<typeof OrgSummary>;

export const UpdateOrgStatusInput = z.object({ status: OrgStatus });
export type UpdateOrgStatusInput = z.infer<typeof UpdateOrgStatusInput>;

export const UpdateLicenseInput = z.object({
  status: LicenseStatus.optional(),
  plan: z.string().optional(),
  maxDevices: z.number().int().positive().optional(),
  validUntil: z.string().datetime().optional(),
});
export type UpdateLicenseInput = z.infer<typeof UpdateLicenseInput>;

export const PublishVersionInput = z.object({
  version: z.string(),
  channel: z.enum(['stable', 'beta']).default('stable'),
  minSupported: z.boolean().default(false),
  releaseNotes: z.string().optional(),
});
export type PublishVersionInput = z.infer<typeof PublishVersionInput>;

export const InviteUserInput = z.object({
  email: z.string().email(),
  role: Role.default('MEMBER'),
});
export type InviteUserInput = z.infer<typeof InviteUserInput>;

/**
 * Per-organization external upload-API (Increff CIMS) configuration.
 *
 * Slug-driven: the URL (`https://{client}.omni.increff.com`) and domain
 * (`{client}-oltp`) are derived from `clientSlug`. The username is a shared
 * constant unless `authUsername` is provided as an override. The password is
 * write-only — sent once, encrypted at rest, NEVER returned (see the View).
 */
export const ExternalApiConfigInput = z.object({
  clientSlug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and hyphens only'), // e.g. adidasgcc
  platform: CimsPlatform.default('PROXY'),
  cimsClientId: z.number().int().positive(),
  webgetDbId: z.number().int().positive(),
  automationMode: AutomationMode.default('MANUAL_LOGIN'),
  returnOrdersPath: z.string().default('/cims/import/returnOrders'),
});
export type ExternalApiConfigInput = z.infer<typeof ExternalApiConfigInput>;

/** Safe view returned to the admin portal — credentials are never sent back. */
export const ExternalApiConfigView = z.object({
  clientSlug: z.string(),
  platform: CimsPlatform,
  baseUrl: z.string(), // derived, for display
  authDomainName: z.string(), // derived, for display
  authUsername: z.string(), // effective (shared)
  cimsClientId: z.number().int(),
  webgetDbId: z.number().int(),
  automationMode: AutomationMode,
  returnOrdersPath: z.string(),
  passwordSet: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type ExternalApiConfigView = z.infer<typeof ExternalApiConfigView>;

/**
 * Non-secret per-organization config the desktop app reads at runtime
 * (GET /app/org-config). Carries ONLY what the client may know — never CIMS
 * credentials, clientId, or dbId.
 */
export const OrgConfigView = z.object({
  orgId: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  automationMode: AutomationMode,
});
export type OrgConfigView = z.infer<typeof OrgConfigView>;
