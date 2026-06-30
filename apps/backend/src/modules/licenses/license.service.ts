import { AppError, ErrorCode, type LicenseStatusResult } from '@rg/shared';
import type { Device, License, Organization } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../env.js';
import { isAtLeast } from '../../lib/semver.js';

export interface LicenseCheckInput {
  orgId: string;
  fingerprint?: string;
  appVersion?: string;
}

export interface LicenseSnapshot {
  org: Organization;
  license: License;
  activeDevices: number;
}

/**
 * Load org + its current license. Throws if the org or a license is missing.
 * The "current" license is the most recently issued one (highest validUntil).
 */
export async function loadOrgLicense(orgId: string): Promise<LicenseSnapshot> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new AppError(ErrorCode.LIC_NOT_FOUND, 'Organization not found');

  const license = await prisma.license.findFirst({
    where: { orgId },
    orderBy: { validUntil: 'desc' },
  });
  if (!license) throw new AppError(ErrorCode.LIC_NOT_FOUND);

  const activeDevices = await prisma.device.count({
    where: { orgId, status: 'ACTIVE' },
  });

  return { org, license, activeDevices };
}

/**
 * Core §8 evaluation, in order:
 *  1. org.status == ACTIVE                       → LIC_ORG_SUSPENDED
 *  2. license.status == ACTIVE && now<validUntil → LIC_EXPIRED
 *  3. device known? else enforce count<=maxDevices → LIC_DEVICE_LIMIT
 *  4. device.status == ACTIVE                    → LIC_DEVICE_REVOKED
 *  5. appVersion >= minSupported                 → updateRequired flag
 *
 * `throwOnBlock=true` (sync gate) raises the first blocking AppError. When false
 * (status endpoint) it returns the computed result without throwing for an
 * update-required condition (update is surfaced via the flag, not an error here).
 */
export async function evaluateLicense(
  input: LicenseCheckInput,
  opts: { throwOnBlock: boolean; knownDevice?: Device | null },
): Promise<LicenseStatusResult> {
  const { org, license, activeDevices } = await loadOrgLicense(input.orgId);

  // 1. org active
  if (org.status !== 'ACTIVE') {
    if (opts.throwOnBlock) throw new AppError(ErrorCode.LIC_ORG_SUSPENDED);
  }

  // 2. license active + not expired
  const now = Date.now();
  const expired = license.status !== 'ACTIVE' || license.validUntil.getTime() <= now;
  if (expired && opts.throwOnBlock) {
    throw new AppError(ErrorCode.LIC_EXPIRED);
  }

  // 3 + 4. device checks (only when a fingerprint is supplied)
  if (input.fingerprint) {
    const device =
      opts.knownDevice ??
      (await prisma.device.findUnique({
        where: { orgId_fingerprint: { orgId: input.orgId, fingerprint: input.fingerprint } },
      }));

    if (!device) {
      // unknown device → would need registration; enforce the cap
      if (activeDevices >= license.maxDevices && opts.throwOnBlock) {
        throw new AppError(ErrorCode.LIC_DEVICE_LIMIT);
      }
    } else if (device.status !== 'ACTIVE' && opts.throwOnBlock) {
      throw new AppError(ErrorCode.LIC_DEVICE_REVOKED);
    }
  }

  // 5. version gate
  const minSupported = env.MIN_SUPPORTED_VERSION;
  const updateRequired = input.appVersion ? !isAtLeast(input.appVersion, minSupported) : false;

  return {
    ok: org.status === 'ACTIVE' && !expired && !updateRequired,
    status: license.status,
    plan: license.plan,
    validUntil: license.validUntil.toISOString(),
    maxDevices: license.maxDevices,
    activeDevices,
    offlineGraceSeconds: env.OFFLINE_GRACE_SECONDS,
    minSupportedVersion: minSupported,
    updateRequired,
  };
}
