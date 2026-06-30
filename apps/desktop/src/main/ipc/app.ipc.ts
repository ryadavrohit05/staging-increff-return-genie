/**
 * App / license / device / update IPC handlers.
 */
import { z } from 'zod';
import { app } from 'electron';
import { CH, type LicenseStatusResult, type DeviceInfo, type OrgConfigView } from '@rg/shared';
import { handle } from './helpers.js';
import { status as licenseStatus } from '../services/license-gate.js';
import { deviceInfo } from '../services/device.js';
import { installUpdate } from '../services/updater.js';
import { openExternal } from '../windows.js';
import { apiClient } from '../services/api-client.js';

const OpenExternalInput = z.object({ url: z.string().url() });

export function registerAppIpc(): void {
  handle(CH.APP_VERSION, null, async (): Promise<string> => app.getVersion());

  handle(CH.APP_INSTALL_UPDATE, null, async (): Promise<{ ok: true }> => {
    await installUpdate();
    return { ok: true };
  });

  handle(CH.APP_OPEN_EXTERNAL, OpenExternalInput, async ({ url }): Promise<{ ok: true }> => {
    await openExternal(url);
    return { ok: true };
  });

  handle(CH.LICENSE_STATUS, null, async (): Promise<LicenseStatusResult> => {
    return licenseStatus();
  });

  handle(CH.DEVICE_INFO, null, async (): Promise<DeviceInfo> => {
    // Authoritative backend record from registration, else local descriptor.
    return deviceInfo();
  });

  handle(CH.APP_ORG_CONFIG, null, async (): Promise<OrgConfigView> => {
    // Non-secret per-org runtime config (automation mode). Backend-authoritative.
    return apiClient.get<OrgConfigView>('/app/org-config');
  });
}
