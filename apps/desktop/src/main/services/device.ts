/**
 * Device fingerprint + registration/heartbeat (ARCHITECTURE.md §8).
 *
 * The fingerprint is a salted SHA-256 of the machine id + OS username, so it is
 * stable per machine+user but not reversible to PII. Registered on first launch;
 * heartbeat fires on launch and before each sync.
 */
import { app } from 'electron';
import { createHash } from 'node:crypto';
import { hostname, userInfo, type as osType, release } from 'node:os';
// node-machine-id is CommonJS and its named exports aren't statically detectable
// by Node's ESM loader (the main bundle is ESM), so importing { machineIdSync }
// directly throws "Named export not found". Import the default (module.exports)
// and destructure — the documented CJS-in-ESM interop pattern.
import nodeMachineId from 'node-machine-id';
import type { DeviceInfo } from '@rg/shared';

const { machineIdSync } = nodeMachineId;
import { config } from '../config.js';
import { apiClient } from './api-client.js';
import { createLog } from './logger.js';

const log = createLog('device');

let cachedFingerprint: string | null = null;

export function fingerprint(): string {
  if (cachedFingerprint) return cachedFingerprint;
  let raw: string;
  try {
    raw = machineIdSync(true); // original=true → raw machine GUID
  } catch {
    raw = hostname(); // fallback if the registry/dbus probe fails
  }
  const user = (() => {
    try {
      return userInfo().username;
    } catch {
      return 'unknown';
    }
  })();
  cachedFingerprint = createHash('sha256')
    .update(`${config.deviceSalt}:${raw}:${user}`)
    .digest('hex');
  return cachedFingerprint;
}

export function osLabel(): string {
  return `${osType()} ${release()}`;
}

export function localDeviceDescriptor() {
  return {
    fingerprint: fingerprint(),
    hostname: hostname(),
    os: osLabel(),
    appVersion: app.getVersion(),
  };
}

/** Last authoritative DeviceInfo from the backend (register response). */
let cachedDeviceInfo: DeviceInfo | null = null;

export async function registerDevice(): Promise<DeviceInfo | null> {
  try {
    cachedDeviceInfo = await apiClient.post<DeviceInfo>(
      '/devices/register',
      localDeviceDescriptor(),
    );
    return cachedDeviceInfo;
  } catch (err) {
    log.warn('Device registration failed (will retry on next launch)', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Backend DeviceInfo if known, else a best-effort local descriptor. */
export function deviceInfo(): DeviceInfo {
  if (cachedDeviceInfo) return cachedDeviceInfo;
  const d = localDeviceDescriptor();
  return {
    id: '00000000-0000-0000-0000-000000000000',
    fingerprint: d.fingerprint,
    hostname: d.hostname,
    os: d.os,
    appVersion: d.appVersion,
    status: 'ACTIVE',
    lastHeartbeat: null,
    registeredAt: new Date().toISOString(),
  };
}

export async function heartbeat(): Promise<void> {
  try {
    await apiClient.post('/devices/heartbeat', {
      fingerprint: fingerprint(),
      appVersion: app.getVersion(),
    });
  } catch (err) {
    log.warn('Heartbeat failed', { err: err instanceof Error ? err.message : String(err) });
  }
}

let heartbeatTimer: NodeJS.Timeout | null = null;

export function startHeartbeat(intervalMs = 5 * 60 * 1000): void {
  stopHeartbeat();
  void heartbeat();
  heartbeatTimer = setInterval(() => void heartbeat(), intervalMs);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
