/**
 * Shared Myntra page helpers — popup dismissal, visibility probing, React
 * native-setter, URL checks. Ported verbatim from the reference
 * `downloadFromMyntra.js`. Kept separate from the step modules so login,
 * dates and generate can all reuse them.
 */

import type { Locator, Page } from 'playwright';
import { AppError, ErrorCode } from '@rg/shared';
import { REPORTS_URL } from './selectors.js';

/** Throw AUTO_CANCELLED if the abort signal has fired. Call between steps. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new AppError(ErrorCode.AUTO_CANCELLED, 'Sync was cancelled.');
  }
}

/** Return the first selector in the list that resolves to a visible element. */
export async function findFirstVisible(
  page: Page,
  selectors: readonly string[],
  timeoutPer = 2000,
): Promise<Locator | null> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      if (await loc.isVisible({ timeout: timeoutPer }).catch(() => false)) {
        return loc;
      }
    } catch {
      /* bad selector — try next */
    }
  }
  return null;
}

/**
 * Dismiss Myntra's in-page "would like to send you notifications" modal.
 * Idempotent — no-op if the modal isn't present.
 */
export async function dismissNotificationPopup(page: Page): Promise<boolean> {
  const candidates: Locator[] = [
    page.getByRole('button', { name: /Don.?t Allow/i }),
    page.locator('button:has-text("Don\'t Allow")'),
    page.locator('button:has-text("Dont Allow")'),
  ];
  for (const cand of candidates) {
    const btn = cand.first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      await btn.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

/**
 * Dismiss any open popup/dropdown that may intercept clicks.
 * Used before clicking GENERATE REPORT.
 */
const ALERT_CONTAINERS = [
  '.aui-banner-container',
  '.aui-banner-info',
  '.div-banner',
  '[role="alert"]',
] as const;
const ALERT_CLOSE_SELECTORS = [
  '[aria-label="Close"]',
  '[aria-label*="close" i]',
  'button.close',
  '.aui-banner-close',
  '.close',
  'text="×"', // ×
  'text="✕"', // ✕
] as const;

/**
 * Dismiss Myntra in-page ALERT / INFO banners (e.g. the `aui-banner-info`
 * "Operational Reports" notice) that occasionally appear mid-run and intercept
 * clicks or abort the download. Per operational policy these are ALWAYS closed
 * and the run proceeds. Idempotent + fast (short timeouts), safe to call in
 * loops. Clicks the banner close control; if it persists, hides the banner via
 * the DOM as a last resort so it can never intercept a click. Returns how many
 * banners were acted on.
 */
export async function dismissAlerts(page: Page): Promise<number> {
  let acted = 0;
  for (const container of ALERT_CONTAINERS) {
    const cont = page.locator(container).first();
    if ((await cont.count().catch(() => 0)) === 0) continue;
    if (!(await cont.isVisible({ timeout: 250 }).catch(() => false))) continue;

    let closed = false;
    for (const csel of ALERT_CLOSE_SELECTORS) {
      const btn = cont.locator(csel).first();
      if (await btn.isVisible({ timeout: 200 }).catch(() => false)) {
        await btn.click({ timeout: 800, force: true }).catch(() => {});
        await cont.waitFor({ state: 'hidden', timeout: 1000 }).catch(() => {});
        closed = true;
        acted += 1;
        break;
      }
    }
    if (!closed) {
      const hidden = await page
        .evaluate((sels: string[]) => {
          let n = 0;
          for (const sel of sels) {
            document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
              if (el.offsetParent !== null) {
                el.style.display = 'none';
                el.style.pointerEvents = 'none';
                n += 1;
              }
            });
          }
          return n;
        }, ['.aui-banner-container', '.aui-banner-info', '.div-banner'])
        .catch(() => 0);
      acted += hidden;
    }
  }
  return acted;
}

/**
 * Run dismissAlerts on a fixed interval for the WHOLE automation run, so an
 * alert/info banner that appears at an unpredictable moment is closed within a
 * couple of seconds — not only at the explicit checkpoints. Returns a stop fn;
 * call it in a finally. Errors are swallowed so the watcher never breaks a run.
 */
export function startAlertWatcher(page: Page, intervalMs = 1500): () => void {
  let stopped = false;
  const tick = (): void => {
    if (stopped || page.isClosed()) return;
    void dismissAlerts(page).catch(() => {});
  };
  const handle: ReturnType<typeof setInterval> = setInterval(tick, intervalMs);
  tick(); // run once immediately
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}

export async function dismissAnyPopup(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => {});

  // Close marketplace alert / info banners first (they sit above the form).
  await dismissAlerts(page).catch(() => {});

  // Click the page heading — guaranteed outside any portal/popup.
  try {
    const heading = page.locator('text=/Operational Reports/i').first();
    if (await heading.isVisible({ timeout: 1500 }).catch(() => false)) {
      await heading.click({ position: { x: 4, y: 4 }, timeout: 3000 });
      return;
    }
  } catch {
    /* fall through */
  }

  // Last resort: dispatch a click on body via JS.
  await page.evaluate(() => document.body.click()).catch(() => {});
}

/**
 * Set a React-controlled input's value using the native setter so React's
 * internal change-tracking sees it, then fire input/change/blur events.
 * Fallback for masked/controlled date inputs.
 */
export async function setReactInputValue(
  page: Page,
  selector: string,
  value: string,
): Promise<boolean> {
  return page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) return false;
      const proto = window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (!setter) return false;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    },
    { sel: selector, val: value },
  );
}

/** True when the page is on the partner reports URL. */
export function onReportsPage(page: Page): boolean {
  try {
    const u = new URL(page.url());
    return (
      u.hostname === 'partners.myntrainfo.com' &&
      u.pathname.toLowerCase().includes('/reports/ops-reports')
    );
  } catch {
    return false;
  }
}

export { REPORTS_URL };
