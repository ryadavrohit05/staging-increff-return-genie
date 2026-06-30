/**
 * Failure forensics: save a screenshot + HTML dump of the current page.
 *
 * Ported from the reference `dumpDebugSnapshot` / `dumpCalendarHtml`. Called at
 * critical points (post-login, on any step failure) so an operator can review
 * exactly what the page looked like. The returned PNG path is emitted as a
 * `screenshot` event and (in the desktop) uploaded to Storage `screenshots/`
 * (ARCHITECTURE.md §15).
 *
 * Best-effort by design: a snapshot failure must never mask the original error.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Save `<label>-<ts>.png` + `<label>-<ts>.html` under `dir`.
 * Returns the absolute PNG path on success, or `null` if everything failed.
 */
export async function dumpDebugSnapshot(
  page: Page,
  label: string,
  dir: string,
): Promise<string | null> {
  try {
    await ensureDir(dir);
    const stamp = timestamp();
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]+/g, '-');
    const pngPath = path.join(dir, `${safeLabel}-${stamp}.png`);
    const htmlPath = path.join(dir, `${safeLabel}-${stamp}.html`);

    await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});

    const html = await page.content().catch(() => '');
    if (html) await fs.writeFile(htmlPath, html, 'utf8').catch(() => {});

    return pngPath;
  } catch {
    // Best effort — never throw from a snapshot.
    return null;
  }
}
