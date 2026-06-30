/**
 * Marketplace credential IPC handlers (ARCHITECTURE.md §5).
 *
 * The renderer can save/clear creds and read non-secret status, but can NEVER
 * read back a stored password — there is deliberately no "load" channel exposed.
 */
import { z } from 'zod';
import {
  CH,
  CredentialInput,
  Marketplace,
  type CredentialStatus,
} from '@rg/shared';
import { handle } from './helpers.js';
import { saveCred, clearCred, credStatus, listCreds } from '../services/keystore.js';

const MarketplaceInput = z.object({ marketplace: Marketplace });

export function registerCredsIpc(): void {
  handle(CH.CREDS_SAVE, CredentialInput, async (input): Promise<{ ok: true }> => {
    await saveCred(input);
    return { ok: true };
  });

  handle(CH.CREDS_STATUS, MarketplaceInput, async ({ marketplace }): Promise<CredentialStatus> => {
    return credStatus(marketplace);
  });

  handle(CH.CREDS_LIST, null, async (): Promise<CredentialStatus[]> => {
    return listCreds();
  });

  handle(CH.CREDS_CLEAR, MarketplaceInput, async ({ marketplace }): Promise<{ ok: true }> => {
    await clearCred(marketplace);
    return { ok: true };
  });
}
