/**
 * Filesystem layout under userData (%APPDATA%/ReturnGenie on Windows).
 * All app-private state lives here; nothing secret is ever bundled into the asar.
 */
import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

function ensure(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** %APPDATA%/ReturnGenie */
export function userDataDir(): string {
  return app.getPath('userData');
}

/** Encrypted marketplace credentials (one .enc per marketplace). */
export function credsDir(): string {
  return ensure(join(userDataDir(), 'creds'));
}

/** Encrypted JWT/refresh token store. */
export function tokenFile(): string {
  return join(userDataDir(), 'tokens.enc');
}

/** Persisted license-gate state (last-good timestamp for offline grace). */
export function licenseStateFile(): string {
  return join(userDataDir(), 'license-state.json');
}

/**
 * Download directory for the raw report — the user's system Downloads folder so
 * the file is easy to find. Filenames are already unique + timestamped, so no
 * per-run subfolder is needed. `syncRunId` is kept for signature compatibility.
 */
export function downloadDir(_syncRunId?: string): string {
  return ensure(app.getPath('downloads'));
}

/** Per-sync-run screenshot directory for failure snapshots. */
export function screenshotDir(syncRunId: string): string {
  return ensure(join(userDataDir(), 'screenshots', syncRunId));
}
