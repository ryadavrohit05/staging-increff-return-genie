/**
 * Sync IPC handlers (ARCHITECTURE.md §4, §8, §15).
 *
 * SYNC_START enforces the license gate, then hands off to the automation host.
 * History/results/retry-failed proxy to the backend. Live progress is pushed
 * separately over CH.SYNC_EVENT by the automation host.
 */
import { z } from 'zod';
import { app, shell, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import {
  CH,
  SyncStartInput,
  AppError,
  ErrorCode,
  type SyncSummary,
  type SyncResultRow,
} from '@rg/shared';
import { handle } from './helpers.js';
import { assertCanSync } from '../services/license-gate.js';
import { startSync, cancelSync } from '../services/automation-host.js';
import { heartbeat } from '../services/device.js';
import { apiClient } from '../services/api-client.js';

const CancelInput = z.object({ syncRunId: z.string().uuid() });
const RunIdInput = z.object({ syncRunId: z.string().uuid() });
const HistoryInput = z
  .object({ page: z.number().int().positive().optional(), pageSize: z.number().int().positive().optional() })
  .optional();

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function registerSyncIpc(getWindow: () => BrowserWindow | null): void {
  handle(CH.SYNC_START, SyncStartInput, async (input, event): Promise<{ syncRunId: string }> => {
    // Re-check the license server-side before every sync (§8). Heartbeat too.
    await assertCanSync();
    await heartbeat();
    return startSync(input, event.sender);
  });

  handle(CH.SYNC_CANCEL, CancelInput, async ({ syncRunId }, event): Promise<{ ok: true }> => {
    await cancelSync(syncRunId, event.sender);
    return { ok: true };
  });

  handle(CH.SYNC_HISTORY, HistoryInput, async (input): Promise<Paginated<SyncSummary>> => {
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 20;
    return apiClient.get<Paginated<SyncSummary>>(
      `/sync/runs?page=${page}&pageSize=${pageSize}`,
    );
  });

  handle(CH.SYNC_RESULTS, RunIdInput, async ({ syncRunId }): Promise<SyncResultRow[]> => {
    return apiClient.get<SyncResultRow[]>(`/sync/runs/${syncRunId}/results`);
  });

  handle(CH.SYNC_RETRY_FAILED, RunIdInput, async ({ syncRunId }): Promise<{ ok: true }> => {
    await apiClient.post(`/sync/runs/${syncRunId}/retry-failed`, {});
    // Keep getWindow referenced for symmetry / future push notifications.
    void getWindow();
    return { ok: true };
  });

  // Download the detailed results CSV (all CIMS fields + per-order response) to
  // the OS Downloads folder, then reveal it in the file manager.
  handle(CH.SYNC_DOWNLOAD_RESULTS, RunIdInput, async ({ syncRunId }): Promise<{ path: string }> => {
    const { url } = await apiClient.get<{ url: string; expiresIn: number }>(
      `/sync/runs/${syncRunId}/artifact/results`,
    );
    const res = await fetch(url);
    if (!res.ok) {
      throw new AppError(ErrorCode.NETWORK_ERROR, `Could not download results (HTTP ${res.status}).`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = join(app.getPath('downloads'), `return-genie-results__${syncRunId.slice(0, 8)}__${stamp}.csv`);
    await writeFile(dest, bytes);
    shell.showItemInFolder(dest);
    return { path: dest };
  });
}
