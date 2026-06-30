/**
 * Persistent, encrypted JWT/refresh token store (ARCHITECTURE.md §6).
 *
 * Tokens live ONLY in the main process — never in the renderer, never in
 * localStorage. At rest they are encrypted with Electron `safeStorage` (DPAPI on
 * Windows). The renderer can learn it is "logged in" (via auth state push) but
 * never receives the raw tokens.
 */
import { safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import type { AuthTokens } from '@rg/shared';
import { tokenFile } from './paths.js';
import { createLog } from './logger.js';

const log = createLog('token-store');

let cache: AuthTokens | null = null;

export async function loadTokens(): Promise<AuthTokens | null> {
  if (cache) return cache;
  try {
    const blob = await fs.readFile(tokenFile());
    if (!safeStorage.isEncryptionAvailable()) {
      // Encryption became unavailable since last run; treat as logged out.
      log.warn('safeStorage unavailable while loading tokens; ignoring at-rest store');
      return null;
    }
    const json = safeStorage.decryptString(blob);
    cache = JSON.parse(json) as AuthTokens;
    return cache;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  cache = tokens;
  if (!safeStorage.isEncryptionAvailable()) {
    // Without OS encryption we refuse to write tokens to disk in plaintext.
    log.warn('safeStorage unavailable; keeping tokens in-memory only');
    return;
  }
  const blob = safeStorage.encryptString(JSON.stringify(tokens));
  await fs.writeFile(tokenFile(), blob, { mode: 0o600 });
}

export async function clearTokens(): Promise<void> {
  cache = null;
  await fs.rm(tokenFile(), { force: true });
}

/** Synchronous accessor for the in-memory copy (used by the API client). */
export function peekTokens(): AuthTokens | null {
  return cache;
}
