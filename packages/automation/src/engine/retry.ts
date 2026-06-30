/**
 * Retry primitives.
 *
 * `withRetry` wraps a fragile step with an escalating attempt budget and
 * backoff. `clickWithStrategies` generalizes the reference's hard-won
 * 4-strategy click (native → force → JS .click() → dispatched MouseEvent) used
 * on the "Use Email And Password" chooser and any other element where React
 * mounts handlers late or overlays intercept clicks (ARCHITECTURE.md §15).
 */

import type { Locator, Page } from 'playwright';
import { rand } from './humanize.js';
import type { EmitFn } from './logger.js';
import { logEvent } from './logger.js';

export interface RetryOptions {
  attempts: number;
  label: string;
  stage?: string;
  /** Base backoff in ms; doubled each attempt (capped). */
  backoffMs?: number;
  onEvent?: EmitFn;
}

/**
 * Run `fn` up to `attempts` times with exponential backoff. The attempt index
 * (1-based) is passed to `fn` so callers can escalate aggressiveness per try.
 * Re-throws the last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const { attempts, label, stage = '[Engine]', backoffMs = 500, onEvent } = opts;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      onEvent?.(
        logEvent('WARN', stage, `${label} — attempt ${attempt}/${attempts} failed: ${msg}`),
      );
      if (attempt < attempts) {
        const wait = Math.min(backoffMs * 2 ** (attempt - 1), 8000);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`${label} failed after ${attempts} attempts`);
}

/**
 * Click `locator` using escalating strategies. Returns `true` as soon as a
 * strategy throws no error; the caller is responsible for verifying the click
 * actually advanced the page (the reference does this per-target). `n` controls
 * how many of the strategies to attempt (default: all 4).
 *
 * Strategy order (reference parity):
 *   1. native click (with human-like delay)
 *   2. force click (bypasses actionability/overlay checks)
 *   3. JS element.click()
 *   4. dispatched MouseEvent sequence (mousedown → mouseup → click)
 */
export async function clickWithStrategies(
  _page: Page,
  locator: Locator,
  n = 4,
): Promise<boolean> {
  const strategies: Array<{ name: string; run: (t: Locator) => Promise<void> }> = [
    { name: 'native click', run: (t) => t.click({ delay: rand(60, 120), timeout: 5000 }) },
    {
      name: 'force click',
      run: (t) => t.click({ force: true, delay: rand(60, 120), timeout: 5000 }),
    },
    { name: 'JS .click()', run: (t) => t.evaluate((el) => (el as HTMLElement).click()) },
    {
      name: 'dispatched MouseEvent',
      run: (t) =>
        t.evaluate((el) => {
          const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
          el.dispatchEvent(new MouseEvent('mousedown', opts));
          el.dispatchEvent(new MouseEvent('mouseup', opts));
          el.dispatchEvent(new MouseEvent('click', opts));
        }),
    },
  ];

  const limit = Math.max(1, Math.min(n, strategies.length));
  for (let i = 0; i < limit; i++) {
    const strat = strategies[i];
    if (!strat) continue;
    try {
      await strat.run(locator);
      return true;
    } catch {
      // try the next, more aggressive strategy
    }
  }
  return false;
}
