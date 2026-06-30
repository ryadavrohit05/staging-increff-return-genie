/**
 * Human-like timing helpers, ported verbatim from the reference
 * `downloadFromMyntra.js`. These make the automation look less machine-gun-fast
 * (gentler on the portal, less bot-flaggable) and are tuned via the `RG_PACE`
 * env var: 1 = default, 2 = twice as slow, 0.5 = faster.
 *
 * No arbitrary sleeps live anywhere else in the engine — this is the ONLY place
 * `waitForTimeout` is used as a deliberate delay (ARCHITECTURE.md engineering
 * rules). Everywhere else uses state-based Playwright waits.
 */

import type { Locator, Page } from 'playwright';

/** Random integer in [min, max] — used to vary timing so actions look human. */
export function rand(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** The pace multiplier read from the environment (defaults to 1). */
function pace(): number {
  return Number(process.env.RG_PACE) || 1;
}

/**
 * Human-like "think time" pause between actions, scaled by `RG_PACE`.
 */
export async function humanPause(page: Page, min = 900, max = 2200): Promise<void> {
  const p = pace();
  await page.waitForTimeout(rand(Math.round(min * p), Math.round(max * p)));
}

/**
 * Type into a field at a human-like pace with jittered keystroke timing.
 * Uses `locator.pressSequentially()` which dispatches keys directly to the
 * element — immune to focus drift from React re-renders (hard-won: Myntra's
 * login fields re-mount on each keystroke under certain conditions).
 */
export async function humanType(locator: Locator, text: string): Promise<void> {
  const value = String(text);
  await locator.waitFor({ state: 'visible', timeout: 30_000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});

  // Explicitly acquire DOM focus. In the Electron-hosted headful browser the
  // Chromium window is not the OS-focused window, so a single click sometimes
  // fails to land focus on the input — the symptom being "credentials only type
  // after a manual click". Click AND focus so keystrokes have somewhere to go.
  await locator.click({ delay: rand(80, 160) }).catch(() => {});
  await locator.focus().catch(() => {});
  await locator.page().waitForTimeout(rand(250, 600)); // pause before typing

  // Clear existing value (fill, then keyboard fallback for masked inputs).
  try {
    await locator.fill('');
  } catch {
    await locator.page().keyboard.press('Control+A').catch(() => {});
    await locator.page().keyboard.press('Delete').catch(() => {});
  }

  // Type character by character with human-like jitter. MUST NOT throw — if it
  // does (e.g. unfocused Electron window), we still need to reach the
  // focus-independent fallbacks below, so swallow any error here.
  await locator.pressSequentially(value, { delay: rand(110, 200) }).catch(() => {});
  await locator.page().waitForTimeout(rand(300, 700)); // settle after typing

  // Verify the value actually landed. In the Electron utility-process context
  // the Chromium window does not hold OS keyboard focus, so CDP keystrokes can
  // be dropped (the symptom: "credentials only type after a manual click").
  // Escalate through focus-independent methods until the value sticks:
  //   1) pressSequentially (above) — human-like, used when the window is focused
  //   2) fill()            — Playwright native fill
  //   3) DOM native setter — pure JS via evaluate(); cannot be affected by focus
  const matches = async () => {
    const v = await locator.inputValue().catch(() => null);
    return v !== null && v.trim() === value.trim();
  };

  if (!(await matches())) {
    await locator.fill(value).catch(() => {});
  }
  if (!(await matches())) {
    // Last resort — set the value directly and fire the events React listens for.
    // Guaranteed to work regardless of OS window focus.
    await locator
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
}
