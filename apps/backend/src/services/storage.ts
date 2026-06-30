import { AppError, ErrorCode } from '@rg/shared';
import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';

export type ArtifactKind = 'report' | 'results' | 'screenshot' | 'release';

const BUCKET: Record<ArtifactKind, string> = {
  report: env.STORAGE_BUCKET_REPORTS,
  results: env.STORAGE_BUCKET_RESULTS,
  screenshot: env.STORAGE_BUCKET_SCREENSHOTS,
  release: env.STORAGE_BUCKET_RELEASES,
};

/** Object path is always `<org_id>/<sync_run_id>/<filename>` (§13). */
export function artifactPath(orgId: string, syncRunId: string, filename: string): string {
  return `${orgId}/${syncRunId}/${filename}`;
}

/**
 * Generate a short-lived signed URL that allows a browser to upload directly
 * to Supabase Storage without routing the binary through this server.
 * This avoids loading large files (e.g. 74 MB installers) into Node.js memory.
 */
export async function createSignedUploadUrl(
  kind: ArtifactKind,
  path: string,
): Promise<{ signedUrl: string; token: string; path: string }> {
  const bucket = BUCKET[kind];
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUploadUrl(path);
  if (error || !data) {
    logger.error({ err: error?.message, bucket, path }, 'signed upload url failed');
    throw new AppError(ErrorCode.INTERNAL, 'Failed to create upload URL');
  }
  return { signedUrl: data.signedUrl, token: data.token, path: data.path };
}

/** Upload a buffer to a bucket using the service role (bypasses Storage RLS). */
export async function uploadArtifact(
  kind: ArtifactKind,
  path: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const bucket = BUCKET[kind];
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, body, { contentType, upsert: true });
  if (error) {
    logger.error({ err: error.message, bucket, path }, 'storage upload failed');
    throw new AppError(ErrorCode.INTERNAL, 'Failed to store artifact');
  }
  return path;
}

/** Download an object's bytes (service role). */
export async function downloadArtifact(kind: ArtifactKind, path: string): Promise<Buffer> {
  const bucket = BUCKET[kind];
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) {
    logger.error({ err: error?.message, bucket, path }, 'storage download failed');
    throw new AppError(ErrorCode.INTERNAL, 'Failed to read artifact');
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Mint a short-lived signed URL for a stored object. */
export async function signedUrl(
  kind: ArtifactKind,
  path: string,
  expiresInSeconds = 300,
): Promise<string> {
  const bucket = BUCKET[kind];
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    logger.error({ err: error?.message, bucket, path }, 'signed url failed');
    throw new AppError(ErrorCode.INTERNAL, 'Failed to create signed URL');
  }
  return data.signedUrl;
}
