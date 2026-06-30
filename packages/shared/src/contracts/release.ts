import { z } from 'zod';

/**
 * Desktop installer distribution. The installer binary lives in a PRIVATE
 * Supabase Storage bucket; only authenticated + licensed users (or SUPERADMIN)
 * can obtain a short-lived signed download URL via the backend.
 */

/** Public-ish latest-release info shown on the portal download page. */
export const ReleaseInfo = z.object({
  version: z.string(),
  available: z.boolean(), // an installer binary has been uploaded
  fileName: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  releaseNotes: z.string().nullable(),
  releasedAt: z.string().datetime().nullable(),
});
export type ReleaseInfo = z.infer<typeof ReleaseInfo>;

/** Short-lived signed URL for the authenticated user to download the installer. */
export const DownloadTicket = z.object({
  url: z.string(),
  fileName: z.string(),
  expiresIn: z.number().int(),
});
export type DownloadTicket = z.infer<typeof DownloadTicket>;

/** Admin: publish/replace the installer for a version (multipart text fields). */
export const PublishReleaseInput = z.object({
  version: z.string().min(1),
  channel: z.enum(['stable', 'beta']).default('stable'),
  minSupported: z.coerce.boolean().default(false),
  releaseNotes: z.string().optional(),
});
export type PublishReleaseInput = z.infer<typeof PublishReleaseInput>;
