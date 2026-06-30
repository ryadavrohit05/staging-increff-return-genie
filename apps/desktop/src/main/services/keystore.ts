/**
 * Marketplace credential keystore (ARCHITECTURE.md §5).
 *
 * Hard rules:
 *  - Credentials live ONLY on this machine, encrypted, never in the backend/DB.
 *  - Primary: Electron `safeStorage` (DPAPI on Windows) → ciphertext at
 *    %APPDATA%/ReturnGenie/creds/<marketplace>.enc, mode 0600.
 *  - Fallback: `keytar` (Windows Credential Manager) when safeStorage is
 *    unavailable.
 *  - loadCred returns the secret in-memory only; it is NEVER logged.
 *  - Only a non-secret status (configured + label + lastUsedAt) is ever exposed
 *    to the renderer/backend.
 */
import { safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { CredentialInput, CredentialStatus, Marketplace } from '@rg/shared';
import { AppError, ErrorCode } from '@rg/shared';
import { credsDir } from './paths.js';
import { createLog } from './logger.js';

const log = createLog('keystore');

const KEYTAR_SERVICE = 'ReturnGenie';
const MARKETPLACES: Marketplace[] = ['MYNTRA', 'FLIPKART'];

/** keytar is optional/native; load lazily so a missing build doesn't crash. */
async function getKeytar(): Promise<typeof import('keytar') | null> {
  try {
    return await import('keytar');
  } catch {
    return null;
  }
}

interface StoredCred {
  label: string;
  email: string;
  password: string;
  lastUsedAt: string | null;
}

function encFile(marketplace: Marketplace): string {
  return join(credsDir(), `${marketplace}.enc`);
}

/** Metadata kept alongside keytar-stored secrets (label/lastUsedAt are not secret). */
function metaFile(marketplace: Marketplace): string {
  return join(credsDir(), `${marketplace}.meta.json`);
}

export async function saveCred(input: CredentialInput): Promise<void> {
  const record: StoredCred = {
    label: input.label,
    email: input.email,
    password: input.password,
    lastUsedAt: null,
  };

  if (safeStorage.isEncryptionAvailable()) {
    const blob = safeStorage.encryptString(JSON.stringify(record));
    await fs.writeFile(encFile(input.marketplace), blob, { mode: 0o600 });
    log.info('Saved marketplace credentials (safeStorage)', { marketplace: input.marketplace });
    return;
  }

  // Fallback: store the secret blob in the OS credential manager, metadata on disk.
  const keytar = await getKeytar();
  if (!keytar) {
    throw new AppError(
      ErrorCode.CRED_ENCRYPTION_UNAVAILABLE,
      'Secure storage is unavailable and no keychain fallback is present.',
    );
  }
  await keytar.setPassword(
    KEYTAR_SERVICE,
    input.marketplace,
    JSON.stringify({ email: input.email, password: input.password }),
  );
  await fs.writeFile(
    metaFile(input.marketplace),
    JSON.stringify({ label: input.label, lastUsedAt: null }),
    { mode: 0o600 },
  );
  log.info('Saved marketplace credentials (keytar fallback)', { marketplace: input.marketplace });
}

/** Decrypt and return the secret IN MEMORY ONLY. Never log the result. */
export async function loadCred(
  marketplace: Marketplace,
): Promise<{ email: string; password: string }> {
  // Primary path.
  try {
    const blob = await fs.readFile(encFile(marketplace));
    if (!safeStorage.isEncryptionAvailable()) {
      throw new AppError(ErrorCode.CRED_ENCRYPTION_UNAVAILABLE);
    }
    const record = JSON.parse(safeStorage.decryptString(blob)) as StoredCred;
    return { email: record.email, password: record.password };
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Fall through to keytar.
  }

  const keytar = await getKeytar();
  if (keytar) {
    const raw = await keytar.getPassword(KEYTAR_SERVICE, marketplace);
    if (raw) {
      const parsed = JSON.parse(raw) as { email: string; password: string };
      return parsed;
    }
  }

  throw new AppError(ErrorCode.CRED_NOT_CONFIGURED);
}

async function readMeta(
  marketplace: Marketplace,
): Promise<{ label: string; lastUsedAt: string | null } | null> {
  // safeStorage path keeps label/lastUsedAt inside the encrypted blob.
  try {
    const blob = await fs.readFile(encFile(marketplace));
    if (safeStorage.isEncryptionAvailable()) {
      const record = JSON.parse(safeStorage.decryptString(blob)) as StoredCred;
      return { label: record.label, lastUsedAt: record.lastUsedAt };
    }
  } catch {
    /* not stored via safeStorage */
  }
  // keytar path keeps metadata in a side file.
  try {
    const meta = JSON.parse(await fs.readFile(metaFile(marketplace), 'utf8')) as {
      label: string;
      lastUsedAt: string | null;
    };
    return meta;
  } catch {
    return null;
  }
}

export async function credStatus(marketplace: Marketplace): Promise<CredentialStatus> {
  const meta = await readMeta(marketplace);
  return {
    marketplace,
    label: meta?.label ?? '',
    configured: meta !== null,
    lastUsedAt: meta?.lastUsedAt ?? null,
  };
}

export async function listCreds(): Promise<CredentialStatus[]> {
  return Promise.all(MARKETPLACES.map((m) => credStatus(m)));
}

export async function clearCred(marketplace: Marketplace): Promise<void> {
  await fs.rm(encFile(marketplace), { force: true });
  await fs.rm(metaFile(marketplace), { force: true });
  const keytar = await getKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, marketplace);
    } catch {
      /* ignore */
    }
  }
  log.info('Cleared marketplace credentials', { marketplace });
}

/** Stamp lastUsedAt after a successful sync start (non-secret metadata). */
export async function markUsed(marketplace: Marketplace): Promise<void> {
  const now = new Date().toISOString();
  try {
    const blob = await fs.readFile(encFile(marketplace));
    if (safeStorage.isEncryptionAvailable()) {
      const record = JSON.parse(safeStorage.decryptString(blob)) as StoredCred;
      record.lastUsedAt = now;
      await fs.writeFile(
        encFile(marketplace),
        safeStorage.encryptString(JSON.stringify(record)),
        { mode: 0o600 },
      );
      return;
    }
  } catch {
    /* try meta file */
  }
  try {
    const meta = JSON.parse(await fs.readFile(metaFile(marketplace), 'utf8')) as {
      label: string;
      lastUsedAt: string | null;
    };
    meta.lastUsedAt = now;
    await fs.writeFile(metaFile(marketplace), JSON.stringify(meta), { mode: 0o600 });
  } catch {
    /* nothing stored */
  }
}
