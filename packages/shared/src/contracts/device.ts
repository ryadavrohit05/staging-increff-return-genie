import { z } from 'zod';
import { DeviceStatus } from './common.js';

export const DeviceRegisterInput = z.object({
  fingerprint: z.string().min(8),
  hostname: z.string(),
  os: z.string(),
  appVersion: z.string(),
});
export type DeviceRegisterInput = z.infer<typeof DeviceRegisterInput>;

export const DeviceInfo = z.object({
  id: z.string().uuid(),
  fingerprint: z.string(),
  hostname: z.string(),
  os: z.string(),
  appVersion: z.string(),
  status: DeviceStatus,
  lastHeartbeat: z.string().datetime().nullable(),
  registeredAt: z.string().datetime(),
});
export type DeviceInfo = z.infer<typeof DeviceInfo>;

export const HeartbeatInput = z.object({
  fingerprint: z.string(),
  appVersion: z.string(),
});
export type HeartbeatInput = z.infer<typeof HeartbeatInput>;
