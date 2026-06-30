/**
 * Myntra automation timeouts — configurable via env with reference defaults
 * (ARCHITECTURE.md §15 watchdogs).
 */

export const MyntraConfig = {
  get loginTimeoutMs(): number {
    return Number(process.env.MYNTRA_LOGIN_TIMEOUT_MS) || 90_000;
  },
  get reportTimeoutMs(): number {
    return Number(process.env.MYNTRA_REPORT_TIMEOUT_MS) || 15 * 60 * 1000; // 900_000
  },
  /**
   * MANUAL_LOGIN: how long to wait for the user to sign in by hand and reach the
   * Seller Returns Report page before giving up. Generous by default (10 min)
   * since a human is in the loop.
   */
  get manualLoginTimeoutMs(): number {
    return Number(process.env.MYNTRA_MANUAL_LOGIN_TIMEOUT_MS) || 10 * 60 * 1000; // 600_000
  },
} as const;

/** Console-style stage prefix matching the reference. */
export const STAGE = '[Myntra]';
