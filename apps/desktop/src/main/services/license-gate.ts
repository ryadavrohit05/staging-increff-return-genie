/**
 * License gate (ARCHITECTURE.md §8).
 *
 * `assertCanSync()` calls POST /license/validate, caches the result, and enforces
 * an offline grace window using a persisted last-good timestamp. If the backend
 * is unreachable but we are still inside the grace window, syncs are allowed; once
 * the window lapses, we hard-stop. A forced-update flag throws APP_UPDATE_REQUIRED.
 */
import { promises as fs } from 'node:fs';
import { AppError, ErrorCode, type LicenseStatusResult } from '@rg/shared';
import { apiClient } from './api-client.js';
import { localDeviceDescriptor } from './device.js';
import { licenseStateFile } from './paths.js';
import { createLog } from './logger.js';

const log = createLog('license-gate');

interface PersistedState {
  lastGoodAt: number; // epoch ms of last successful validate
  offlineGraceSeconds: number;
  lastResult: LicenseStatusResult;
}

let cached: LicenseStatusResult | null = null;

async function readState(): Promise<PersistedState | null> {
  try {
    return JSON.parse(await fs.readFile(licenseStateFile(), 'utf8')) as PersistedState;
  } catch {
    return null;
  }
}

async function writeState(state: PersistedState): Promise<void> {
  await fs.writeFile(licenseStateFile(), JSON.stringify(state), { mode: 0o600 });
}

/** Map a non-ok validate result to the appropriate AppError code. */
function errorFromResult(result: LicenseStatusResult): AppError {
  if (result.updateRequired) return new AppError(ErrorCode.APP_UPDATE_REQUIRED);
  switch (result.status) {
    case 'EXPIRED':
      return new AppError(ErrorCode.LIC_EXPIRED);
    case 'CANCELLED':
      return new AppError(ErrorCode.LIC_ORG_SUSPENDED);
    default:
      return new AppError(ErrorCode.LIC_NOT_FOUND);
  }
}

/** Validate against the backend, refreshing the cache + persisted grace anchor. */
export async function validate(): Promise<LicenseStatusResult> {
  const result = await apiClient.post<LicenseStatusResult>(
    '/license/validate',
    localDeviceDescriptor(),
  );
  cached = result;
  await writeState({
    lastGoodAt: Date.now(),
    offlineGraceSeconds: result.offlineGraceSeconds,
    lastResult: result,
  });
  return result;
}

/** Read current status for the Settings UI (best-effort, falls back to cache). */
export async function status(): Promise<LicenseStatusResult> {
  try {
    return await validate();
  } catch (err) {
    if (cached) return cached;
    const state = await readState();
    if (state) return state.lastResult;
    throw err instanceof AppError ? err : new AppError(ErrorCode.NETWORK_ERROR);
  }
}

/**
 * Enforce licensing before a sync. Throws AppError on any blocking condition.
 */
export async function assertCanSync(): Promise<void> {
  try {
    const result = await validate();
    if (result.updateRequired) throw new AppError(ErrorCode.APP_UPDATE_REQUIRED);
    if (!result.ok) throw errorFromResult(result);
    return;
  } catch (err) {
    // A definitive backend rejection (license/auth/update) is final.
    if (err instanceof AppError && err.code !== ErrorCode.NETWORK_ERROR) throw err;

    // Network failure: fall back to the offline grace window.
    const state = await readState();
    if (!state) {
      throw new AppError(
        ErrorCode.NETWORK_ERROR,
        'Cannot validate your license offline. Connect to the internet to continue.',
      );
    }
    const elapsedSec = (Date.now() - state.lastGoodAt) / 1000;
    if (elapsedSec <= state.offlineGraceSeconds) {
      log.warn('Operating under offline license grace window', {
        elapsedSec: Math.round(elapsedSec),
        graceSec: state.offlineGraceSeconds,
      });
      cached = state.lastResult;
      return;
    }
    throw new AppError(
      ErrorCode.LIC_EXPIRED,
      'Offline grace period has elapsed. Reconnect to revalidate your license.',
    );
  }
}
