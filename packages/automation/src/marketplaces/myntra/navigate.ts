/**
 * Myntra navigation + dropdown selection — ported from the reference
 * `waitForReportsPage`, `findDropdownTrigger`, `selectField`.
 *
 * The three dropdowns (STORE / PARTNER TYPE / REPORT) are React combos with
 * searchable menus; we locate the trigger by its label, open it, type to filter,
 * then click the matching option. A positional fallback (index 0/1/2) covers the
 * case where the label can't be matched.
 */

import type { Locator, Page } from 'playwright';
import { AppError, ErrorCode } from '@rg/shared';
import { humanPause, rand } from '../../engine/humanize.js';
import { dumpDebugSnapshot } from '../../engine/snapshot.js';
import { createLogger, type EmitFn } from '../../engine/logger.js';
import { STAGE } from './config.js';
import { REPORTS_READY_SELECTORS } from './selectors.js';

/**
 * Wait until the reports page is fully rendered (GENERATE REPORT visible).
 * Emits a heartbeat log every ~15s so stuck runs show diagnostic info.
 */
export async function waitForReportsPage(
  page: Page,
  timeoutMs: number,
  screenshotDir: string,
  emit: EmitFn,
): Promise<void> {
  const log = createLogger(STAGE, emit);
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let lastHeartbeat = 0;

  while (Date.now() < deadline) {
    for (const sel of REPORTS_READY_SELECTORS) {
      try {
        await page.locator(sel).first().waitFor({ state: 'visible', timeout: 5000 });
        return; // success
      } catch {
        /* try next */
      }
    }

    if (Date.now() - lastHeartbeat > 15_000) {
      lastHeartbeat = Date.now();
      try {
        const url = page.url();
        const title = await page.title();
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        log.info(`  waiting (${elapsed}s) | url=${url} | title="${title}"`);
      } catch {
        /* ignore */
      }
    }

    await page.waitForTimeout(2000); // polled check interval
  }

  const shot = await dumpDebugSnapshot(page, 'login-timeout', screenshotDir);
  if (shot) log.screenshot(shot);
  throw new AppError(
    ErrorCode.AUTO_LOGIN_TIMEOUT,
    `Reports page did not appear after ${Math.round(timeoutMs / 1000)}s.`,
  );
}

/**
 * Find the dropdown trigger near a label, handling native <select> and custom
 * React dropdowns. Falls back to a positional index when the label is missing.
 */
async function findDropdownTrigger(
  page: Page,
  labelText: string,
  fallbackIndex: number | undefined,
  emit: EmitFn,
): Promise<Locator | null> {
  const log = createLogger(STAGE, emit);
  const upper = labelText.toUpperCase();
  const tr =
    'translate(normalize-space(.), "abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ")';

  // Strategy 1: label-text match (case-insensitive via XPath translate).
  const labelXp =
    `(//label[${tr}="${upper}"] | ` +
    `//span[${tr}="${upper}" and not(.//*[${tr}="${upper}"])] | ` +
    `//div[${tr}="${upper}" and not(.//*[${tr}="${upper}"])] | ` +
    `//p[${tr}="${upper}" and not(.//*[${tr}="${upper}"])])[1]`;

  if ((await page.locator(`xpath=${labelXp}`).count()) > 0) {
    const nearTriggerXpaths = [
      `${labelXp}/ancestor::*[1]//select`,
      `${labelXp}/ancestor::*[1]//*[@role="combobox"]`,
      `${labelXp}/ancestor::*[1]//input[not(@type="hidden")]`,
      `${labelXp}/following::select[1]`,
      `${labelXp}/following::*[@role="combobox"][1]`,
      `${labelXp}/following::input[not(@type="hidden")][1]`,
    ];
    for (const xp of nearTriggerXpaths) {
      const cand = page.locator(`xpath=${xp}`).first();
      if ((await cand.count()) > 0 && (await cand.isVisible().catch(() => false))) {
        return cand;
      }
    }
  }

  // Strategy 2: positional fallback (Store=0, Partner Type=1, Report=2).
  if (typeof fallbackIndex === 'number') {
    log.warn(`    label "${labelText}" not found — falling back to dropdown #${fallbackIndex + 1}`);
    const patterns = [
      'select:visible',
      '[role="combobox"]:visible',
      'input[placeholder*="Select" i]:visible',
      'div[class*="select" i][class*="control" i]:visible',
    ];
    for (const pat of patterns) {
      const all = page.locator(pat);
      const count = await all.count();
      if (count > fallbackIndex) return all.nth(fallbackIndex);
    }
  }
  return null;
}

/**
 * Select a value from a form dropdown, handling both native <select> and
 * custom React dropdowns with searchable menus.
 */
export async function selectField(
  page: Page,
  labelText: string,
  value: string,
  fallbackIndex: number | undefined,
  emit: EmitFn,
): Promise<void> {
  const log = createLogger(STAGE, emit);
  log.info(`  selecting ${labelText} = "${value}"`);

  const trigger = await findDropdownTrigger(page, labelText, fallbackIndex, emit);
  if (!trigger) {
    throw new AppError(ErrorCode.AUTO_FILTER_FAILED, `Could not locate dropdown for "${labelText}".`);
  }

  // Native <select>?
  const tag = await trigger.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
  if (tag === 'select') {
    try {
      await trigger.selectOption({ label: value });
    } catch {
      await trigger.selectOption(value);
    }
    await trigger
      .evaluate((el) => {
        const sel = el as HTMLSelectElement;
        return sel.value !== '' || sel.selectedOptions.length > 0;
      })
      .catch(() => {});
    return;
  }

  // Custom dropdown: open, type to filter (searchable combos), click option.
  await trigger.click({ delay: rand(80, 160) });
  await humanPause(page, 500, 1100); // wait for dropdown to open

  try {
    for (const ch of value) {
      await page.keyboard.type(ch);
      await page.waitForTimeout(rand(70, 160)); // human typing cadence
    }
    await humanPause(page, 400, 900); // let the filter apply
  } catch {
    /* non-searchable — ignore */
  }

  const optionSelectors = [
    `[role="option"]:has-text("${value}")`,
    `li[role="option"]:has-text("${value}")`,
    `[class*="option" i]:visible:has-text("${value}")`,
    `[class*="menu" i] :text-is("${value}")`,
    `li:visible:has-text("${value}")`,
  ];

  let clicked = false;
  for (const sel of optionSelectors) {
    const opt = page.locator(sel).first();
    if ((await opt.count()) > 0 && (await opt.isVisible().catch(() => false))) {
      await opt.click({ delay: rand(80, 160) });
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    await page.keyboard.press('Enter'); // highlighted-option fallback
  }
  await humanPause(page, 500, 1100); // settle after selection
}
