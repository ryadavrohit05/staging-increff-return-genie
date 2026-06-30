import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import type {
  OrgSummary,
  CreateOrgInput,
  UpdateOrgStatusInput,
  UpdateLicenseInput,
  PublishVersionInput,
  DeviceInfo,
  SyncSummary,
  OrgStatus,
  LicenseStatus,
} from '@rg/shared';
import { api } from './api';

// ── Shared response envelopes (match backend admin.routes.ts JSON shapes) ─────

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/** GET /admin/sync-runs/:id detail payload. */
export interface SyncRunDetail {
  run: SyncSummary;
  logs: Array<{ ts: string; level: string; stage: string; message: string }>;
  results: Array<{ orderId: string; status: string; error: string | null }>;
  screenshotUrl: string | null;
}

/** GET /admin/audit row. */
export interface AuditEntry {
  id: string;
  orgId: string | null;
  actorId: string | null;
  action: string;
  target: string | null;
  meta: unknown;
  ts: string;
}

export interface SyncRunFilters extends PaginationParams {
  orgId?: string;
  state?: string;
  marketplace?: string;
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const qk = {
  orgs: (p: PaginationParams) => ['orgs', p] as const,
  orgDevices: (orgId: string) => ['orgs', orgId, 'devices'] as const,
  syncRuns: (f: SyncRunFilters) => ['sync-runs', f] as const,
  syncRun: (id: string) => ['sync-runs', id] as const,
  audit: (p: PaginationParams & { orgId?: string }) => ['audit', p] as const,
};

// ── Clients (orgs) ──────────────────────────────────────────────────────────

export function useOrgs(params: PaginationParams) {
  return useQuery({
    queryKey: qk.orgs(params),
    queryFn: () => api.get<Page<OrgSummary>>('/admin/orgs', { ...params }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrgInput) =>
      api.post<{ orgId: string; ownerUserId: string }>('/admin/orgs', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
  });
}

export function useUpdateOrgStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrgStatus }) =>
      api.patch<{ id: string; status: OrgStatus }>(`/admin/orgs/${id}/status`, {
        status,
      } satisfies UpdateOrgStatusInput),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
  });
}

export interface UpdatedLicense {
  id: string;
  status: LicenseStatus;
  plan: string;
  maxDevices: number;
  validUntil: string;
}

export function useUpdateLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLicenseInput }) =>
      api.patch<UpdatedLicense>(`/admin/orgs/${id}/license`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
  });
}

// ── Devices ───────────────────────────────────────────────────────────────────

export function useOrgDevices(orgId: string | undefined) {
  return useQuery({
    queryKey: qk.orgDevices(orgId ?? ''),
    enabled: Boolean(orgId),
    queryFn: () => api.get<{ items: DeviceInfo[] }>(`/admin/orgs/${orgId}/devices`),
  });
}

export function useRevokeDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) =>
      api.post<{ id: string; status: 'REVOKED' }>(`/admin/devices/${deviceId}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orgs'] });
    },
  });
}

// ── Sync monitoring ─────────────────────────────────────────────────────────

export function useSyncRuns(filters: SyncRunFilters) {
  return useQuery({
    queryKey: qk.syncRuns(filters),
    queryFn: () => api.get<Page<SyncSummary>>('/admin/sync-runs', { ...filters }),
    placeholderData: keepPreviousData,
  });
}

export function useSyncRun(id: string | undefined) {
  return useQuery({
    queryKey: qk.syncRun(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => api.get<SyncRunDetail>(`/admin/sync-runs/${id}`),
  });
}

// ── Versions ──────────────────────────────────────────────────────────────────

export function usePublishVersion() {
  return useMutation({
    mutationFn: (input: PublishVersionInput) =>
      api.post<{ id: string; version: string }>('/admin/versions', input),
  });
}

/** Result of POST /admin/releases (installer upload). */
export interface UploadedRelease {
  version: string;
  fileName: string;
  sizeBytes: number;
}

export interface UploadReleaseInput {
  file: File;
  version: string;
  channel: 'stable' | 'beta';
  minSupported: boolean;
  releaseNotes?: string;
}

/**
 * Upload an installer build directly to Supabase Storage via a presigned URL,
 * then confirm the metadata to the backend.
 *
 * 3-step flow (avoids loading 74MB into Render's 512MB free-tier RAM):
 *  1. GET  /admin/releases/upload-url  → get a Supabase signed upload URL
 *  2. PUT  <signedUrl>                 → upload the binary directly to Supabase
 *  3. POST /admin/releases/confirm     → record version + metadata in the DB
 */
export function useUploadRelease() {
  return useMutation({
    mutationFn: async (input: UploadReleaseInput): Promise<UploadedRelease> => {
      // Step 1: get a signed upload URL from the backend.
      const { signedUrl, key } = await api.get<{ signedUrl: string; key: string }>(
        '/admin/releases/upload-url',
        { version: input.version, filename: input.file.name },
      );

      // Step 2: upload the binary directly to Supabase (no backend RAM used).
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: input.file,
      });
      if (!putRes.ok) {
        throw new Error(`Direct upload failed: ${putRes.status} ${putRes.statusText}`);
      }

      // Step 3: tell the backend to record the metadata.
      return api.post<UploadedRelease>('/admin/releases/confirm', {
        version: input.version,
        channel: input.channel,
        minSupported: input.minSupported,
        releaseNotes: input.releaseNotes?.trim() || undefined,
        installerKey: key,
        installerName: input.file.name,
        installerSize: input.file.size,
      });
    },
  });
}


// ── Audit ─────────────────────────────────────────────────────────────────────

export function useAudit(params: PaginationParams & { orgId?: string }) {
  return useQuery({
    queryKey: qk.audit(params),
    queryFn: () => api.get<Page<AuditEntry>>('/admin/audit', { ...params }),
    placeholderData: keepPreviousData,
  });
}
