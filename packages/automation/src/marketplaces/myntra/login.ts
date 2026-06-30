/**
 * Myntra fresh email/password login — ported from the reference
 * `clickUseEmailAndPassword` / `performLogin` / `detectAuthState`.
 *
 * The "Use Email And Password" chooser is the recurring failure point: it's a
 * styled <div>, React mounts the onClick handler asynchronously, and overlays
 * can cover it. We try multiple click targets × the generalized 4-strategy
 * click, verifying each time that the email form actually appeared.
 */

import type { Locator, Page } from 'playwright';
import { AppError, ErrorCode } from '@rg/shared';
import { clickWithStrategies } from '../../engine/retry.js';
import { humanPause, humanType, rand } from '../../engine/humanize.js';
import { dumpDebugSnapshot } from '../../engine/snapshot.js';
import { createLogger, type EmitFn } from '../../engine/logger.js';
import { MyntraConfig, STAGE } from './config.js';
import {
  EMAIL_FIELD_SELECTOR,
  EMAIL_SELECTORS,
  LOGIN_ERROR_PROBES,
  LOGIN_SELECTORS,
  PASSWORD_SELECTORS,
} from './selectors.js';
import { dismissNotificationPopup, findFirstVisible } from './helpers.js';

export type AuthState = 'reports' | 'chooser' | 'email_form' | 'error_page' | 'unknown';

/**
 * Force a value into an input via the DOM native setter + React events. Purely
 * in-page JS, so it works regardless of OS window focus (the Electron edge case
 * where synthesized keystrokes are dropped). Used as the login hard guarantee.
 */
async function forceSetValue(field: Locator, value: string): Promise<void> {
  await field
    .evaluate((el, val) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      if (setter) setter.call(input, val);
      else input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    }, value)
    .catch(() => {});
}

/**
 * DOM-based auth state detector. Races several indicator elements and returns
 * which one appeared first.
 */
export async function detectAuthState(page: Page, timeoutMs = 30_000): Promise<AuthState> {
  const candidates: Array<{ state: AuthState; selector: string }> = [
    { state: 'reports', selector: 'button:has-text("GENERATE REPORT")' },
    { state: 'reports', selector: 'text=/Operational Reports/i' },
    { state: 'chooser', selector: 'text=/Use Email And Password/i' },
    { state: 'email_form', selector: 'input[type="password"]' },
    { state: 'error_page', selector: 'text=/Site Maintenance/i' },
    { state: 'error_page', selector: 'text=/Oops!\\s*Something went wrong/i' },
  ];
  try {
    return await Promise.any(
      candidates.map((c) =>
        page
          .locator(c.selector)
          .first()
          .waitFor({ state: 'visible', timeout: timeoutMs })
          .then(() => c.state),
      ),
    );
  } catch {
    return 'unknown';
  }
}

/**
 * Click the "Use Email And Password" chooser button, escalating across multiple
 * targets and click strategies, reloading between attempts.
 */
export async function clickUseEmailAndPassword(
  page: Page,
  emit: EmitFn,
  maxAttempts = 4,
): Promise<boolean> {
  const log = createLogger(STAGE, emit);
  const emailLocator = (): Locator => page.locator(EMAIL_FIELD_SELECTOR).first();
  const isEmailFormReady = (timeout = 600): Promise<boolean> =>
    emailLocator()
      .isVisible({ timeout })
      .catch(() => false);

  // Already past the chooser? Skip.
  if (await isEmailFormReady(1000)) {
    log.info('  email form already visible — no chooser to click');
    return true;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log.info(`  chooser click — attempt ${attempt}/${maxAttempts}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});

    const chooserVisible = await page
      .getByText(/Use Email And Password/i)
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!chooserVisible) {
      if (await isEmailFormReady(500)) {
        log.info('  email form appeared without a chooser click');
        return true;
      }
      log.info('    chooser text not visible yet');
    } else {
      await dismissNotificationPopup(page);

      // Multiple click targets: button, role=button, text ancestor, text node.
      const targets: Locator[] = [
        page.getByRole('button', { name: /Use Email And Password/i }).first(),
        page.locator('button:has-text("Use Email And Password")').first(),
        page.locator('[role="button"]:has-text("Use Email And Password")').first(),
        page
          .locator(
            'xpath=(//*[normalize-space(.)="Use Email And Password" and ' +
              'not(.//*[normalize-space(.)="Use Email And Password"])])[1]' +
              '/ancestor-or-self::*[self::button or self::a or @role="button" or @onclick or ' +
              'contains(@class,"button") or contains(@class,"btn") or ' +
              'contains(@class,"Button") or contains(@class,"option") or ' +
              'contains(@class,"row") or contains(@class,"item") or ' +
              'contains(@class,"card")][1]',
          )
          .first(),
        page
          .locator(
            'xpath=(//*[normalize-space(.)="Use Email And Password" and ' +
              'not(.//*[normalize-space(.)="Use Email And Password"])])[1]',
          )
          .first(),
      ];

      for (let ti = 0; ti < targets.length; ti++) {
        const target = targets[ti];
        if (!target) continue;
        if (!(await target.isVisible({ timeout: 300 }).catch(() => false))) continue;
        await target.scrollIntoViewIfNeeded().catch(() => {});

        // Escalating 4-strategy click, then verify the page advanced.
        await clickWithStrategies(page, target, 4);

        if (await isEmailFormReady(4000)) {
          log.info(`  chooser advanced (target #${ti + 1})`);
          return true;
        }
        if (/emaillogin|email[-_]login|password/i.test(page.url())) {
          log.info('  chooser advanced — URL changed');
          await emailLocator()
            .waitFor({ state: 'visible', timeout: 10_000 })
            .catch(() => {});
          return true;
        }
      }
    }

    // Reload and retry.
    if (attempt < maxAttempts) {
      log.info('    no strategy advanced — reloading');
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      if (await isEmailFormReady(1000)) {
        log.info('  reload landed on the email form');
        return true;
      }
    }
  }

  throw new AppError(
    ErrorCode.AUTO_LOGIN_FAILED,
    `Could not click "Use Email And Password" after ${maxAttempts} attempts.`,
  );
}

/**
 * Drive the full email-and-password login flow. Throws an AppError on failure —
 * no silent fallback. `screenshotDir` is where failure snapshots land.
 */
export async function performLogin(
  page: Page,
  email: string,
  password: string,
  screenshotDir: string,
  emit: EmitFn,
): Promise<void> {
  const log = createLogger(STAGE, emit);
  log.info('Performing fresh email/password login...');
  // Bring the automation tab to the front so input focus lands reliably.
  await page.bringToFront().catch(() => {});
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {});

  // Step 1: chooser.
  await clickUseEmailAndPassword(page, emit);

  // Step 2: email field (poll up to the login timeout).
  let emailField: Locator | null = null;
  const emailDeadline = Date.now() + MyntraConfig.loginTimeoutMs;
  while (Date.now() < emailDeadline) {
    emailField = await findFirstVisible(page, EMAIL_SELECTORS, 2000);
    if (emailField) break;
    await page.waitForTimeout(1500);
  }
  if (!emailField) {
    const shot = await dumpDebugSnapshot(page, 'login-no-email-field', screenshotDir);
    if (shot) log.screenshot(shot);
    throw new AppError(ErrorCode.AUTO_LOGIN_FAILED, 'Could not locate the Email input field.');
  }

  log.info('  typing email');
  await humanType(emailField, email);
  const emailLen = (await emailField.inputValue().catch(() => '')).length;
  log.info(`  email field length after typing: ${emailLen}${emailLen === 0 ? ' (EMPTY!)' : ''}`);

  // Step 3: password field.
  const passwordField = await findFirstVisible(page, PASSWORD_SELECTORS, 8000);
  if (!passwordField) {
    const shot = await dumpDebugSnapshot(page, 'login-no-password-field', screenshotDir);
    if (shot) log.screenshot(shot);
    throw new AppError(ErrorCode.AUTO_LOGIN_FAILED, 'Could not locate the Password input field.');
  }

  log.info('  typing password');
  await humanType(passwordField, password);
  const pwLen = (await passwordField.inputValue().catch(() => '')).length;
  log.info(`  password field length after typing: ${pwLen}${pwLen === 0 ? ' (EMPTY!)' : ''}`);

  // Hard guarantee: if either field is still empty (focus-loss edge case),
  // set both via the DOM native setter and re-verify before submitting.
  if (emailLen === 0 || pwLen === 0) {
    log.warn('  a field is empty after typing — forcing values via native setter');
    await forceSetValue(emailField, email);
    await forceSetValue(passwordField, password);
    const e2 = (await emailField.inputValue().catch(() => '')).length;
    const p2 = (await passwordField.inputValue().catch(() => '')).length;
    log.info(`  after forced set — email:${e2} password:${p2}`);
  }

  // Step 4: submit.
  const submit = await findFirstVisible(page, LOGIN_SELECTORS, 8000);
  if (!submit) {
    const shot = await dumpDebugSnapshot(page, 'login-no-submit', screenshotDir);
    if (shot) log.screenshot(shot);
    throw new AppError(ErrorCode.AUTO_LOGIN_FAILED, 'Could not locate the LOG IN button.');
  }

  await humanPause(page, 600, 1400); // pause before submitting, like a person.
  log.info('  clicking LOG IN');
  await submit.waitFor({ state: 'visible', timeout: 5000 });
  await submit.click({ delay: rand(80, 160) });

  // The POST will either redirect (success) or surface an error on the page.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  // Visible login errors?
  for (const sel of LOGIN_ERROR_PROBES) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
        const txt = (await loc.innerText().catch(() => '')).trim();
        const shot = await dumpDebugSnapshot(page, 'login-error', screenshotDir);
        if (shot) log.screenshot(shot);
        throw new AppError(
          ErrorCode.AUTO_LOGIN_FAILED,
          `Login failed — error on page: "${txt}"`,
        );
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
    }
  }

  // Bounced back to the chooser = silent credential rejection.
  const onChooser = await page
    .getByText(/Use Email And Password/i)
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);
  if (onChooser) {
    const shot = await dumpDebugSnapshot(page, 'login-bounced', screenshotDir);
    if (shot) log.screenshot(shot);
    throw new AppError(
      ErrorCode.AUTO_LOGIN_FAILED,
      'Login click bounced back to chooser — credentials likely wrong.',
    );
  }

  const shot = await dumpDebugSnapshot(page, 'post-login', screenshotDir);
  if (shot) log.screenshot(shot);
  log.info('Login submitted — waiting for redirect to reports page...');
}
