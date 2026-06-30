/**
 * Tiny semver comparator — sufficient for the `appVersion >= minSupported` gate
 * (ARCHITECTURE.md §8). Handles `MAJOR.MINOR.PATCH` with optional pre-release
 * suffix (the suffix is ignored for ordering). Non-numeric/garbage versions sort
 * as 0.0.0 so a malformed client version is treated as below the floor.
 */
function parse(v: string): [number, number, number] {
  const core = String(v).trim().split('+')[0]?.split('-')[0] ?? '';
  const segs = core.split('.').map((s) => Number.parseInt(s, 10));
  return [segs[0] || 0, segs[1] || 0, segs[2] || 0];
}

/** -1 if a<b, 0 if equal, 1 if a>b. */
export function compareSemver(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] as number;
    const y = pb[i] as number;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** True when `version` is at or above `minimum`. */
export function isAtLeast(version: string, minimum: string): boolean {
  return compareSemver(version, minimum) >= 0;
}
