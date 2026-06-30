/**
 * Settings store: marketplace credential statuses, license status, device info,
 * app version + update lifecycle. Pulls from the main process on demand.
 */
import { create } from 'zustand';
import type {
  CredentialStatus,
  LicenseStatusResult,
  DeviceInfo,
} from '@rg/shared';
import { ipc } from '../lib/ipc';

interface UpdateEvent {
  status: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

interface SettingsStore {
  creds: CredentialStatus[];
  license: LicenseStatusResult | null;
  device: DeviceInfo | null;
  version: string;
  update: UpdateEvent | null;

  refreshCreds: () => Promise<void>;
  refreshLicense: () => Promise<void>;
  refreshDevice: () => Promise<void>;
  refreshVersion: () => Promise<void>;
  installUpdate: () => Promise<void>;
  _bindUpdate: () => void;
}

let bound = false;

export const useSettings = create<SettingsStore>((set, get) => ({
  creds: [],
  license: null,
  device: null,
  version: '',
  update: null,

  refreshCreds: async () => set({ creds: await ipc.creds.list() }),
  refreshLicense: async () => {
    try {
      set({ license: await ipc.license.status() });
    } catch {
      set({ license: null });
    }
  },
  refreshDevice: async () => {
    try {
      set({ device: await ipc.device.info() });
    } catch {
      set({ device: null });
    }
  },
  refreshVersion: async () => set({ version: await ipc.app.version() }),
  installUpdate: async () => {
    await ipc.app.installUpdate();
  },

  _bindUpdate: () => {
    if (bound) return;
    bound = true;
    ipc.app.onUpdate((e) => set({ update: e }));
    void get().refreshVersion();
  },
}));
