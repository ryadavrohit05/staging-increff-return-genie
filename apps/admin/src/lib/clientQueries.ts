import { useMutation, useQuery, keepPreviousData } from '@tanstack/react-query';
import type {
  ReleaseInfo,
  DownloadTicket,
  LicenseStatusResult,
  DeviceInfo,
  SyncSummary,
  SyncResultRow,
} from '@rg/shared';
import { api } from './api';
import type { Page, PaginationParams } from './queries';

// ── Query keys ────────────────────────────────────────────────────────────────

export const clientQk = {
  latestRelease: ['app', 'version', 'latest'] as const,
  license: ['license', 'status'] as const,
  devices: ['devices'] as const,
  syncRuns: (p: PaginationParams) => ['sync', 'runs', p] as const,
  syncRunResults: (id: string) => ['sync', 'runs', id, 'results'] as const,
};

// ── Download / latest release ─────────────────────────────────────────────────

export function useLatestRelease() {
  return useQuery({
    queryKey: clientQk.latestRelease,
    queryFn: () => api.get<ReleaseInfo>('/app/version/latest'),
  });
}

/**
 * Requests a short-lived signed download URL. Called imperatively on click
 * (not on mount) so the URL is fresh; the page triggers the browser download
 * from `ticket.url`.
 */
export function useRequestDownload() {
  return useMutation({
    mutationFn: () => api.get<DownloadTicket>('/app/download'),
  });
}

// ── License ─────────────────────────────────────────────────────────────────

export function useLicenseStatus() {
  return useQuery({
    queryKey: clientQk.license,
    queryFn: () => api.get<LicenseStatusResult>('/license/status'),
  });
}

// ── Devices ───────────────────────────────────────────────────────────────────

export function useMyDevices() {
  return useQuery({
    queryKey: clientQk.devices,
    queryFn: () => api.get<{ items: DeviceInfo[] }>('/devices'),
  });
}

// ── Sync history ──────────────────────────────────────────────────────────────

export function useMySyncRuns(params: PaginationParams) {
  return useQuery({
    queryKey: clientQk.syncRuns(params),
    queryFn: () => api.get<Page<SyncSummary>>('/sync/runs', { ...params }),
    placeholderData: keepPreviousData,
  });
}

export function useSyncRunResults(id: string | undefined) {
  return useQuery({
    queryKey: clientQk.syncRunResults(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => api.get<{ items: SyncResultRow[] }>(`/sync/runs/${id}/results`),
  });
}
