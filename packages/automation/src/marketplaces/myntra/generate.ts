/**
 * Myntra report generation + queue polling — ported from the reference
 * `captureExistingRowSignatures`, `waitForCompletedRow`, and the GENERATE REPORT
 * click logic.
 *
 * We snapshot existing queue rows BEFORE clicking GENERATE so we can tell our
 * new row apart from pre-existing ones with identical filters, then poll the
 * table (reloading every ~20s) for a NEW COMPLETED row carrying a DOWNLOAD link.
 */

import type { Locator, Page } from 'playwright';
import { AppError, ErrorCode } from '@rg/shared';
import { humanPause, rand } from '../../engine/humanize.js';
import { createLogger, type EmitFn } from '../../engine/logger.js';
import { STAGE } from './config.js';
import { SELECTORS } from './selectors.js';
import { dismissAlerts, dismissAnyPopup, dismissNotificationPopup } from './helpers.js';

export interface ReportFilters {
  store: string;
  partnerType: string;
  report: string;
  startDate: string;
  endDate: string;
}

/** Strip status words so a row's identity is stable across status transitions. */
function normalizeRowSignature(text: string): string {
  return String(text || '')
    .replace(/\b(PROCESSING|COMPLETED|PENDING|FAILED|IN[ _]?PROGRESS|QUEUED|SUBMITTED|RUNNING)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRowLocator(page: Page, f: ReportFilters, completedOnly: boolean): Locator {
  const dateRangeText = `${f.startDate} - ${f.endDate}`;
  let loc = page
    .locator('tr, [role="row"]')
    .filter({ hasText: f.store })
    .filter({ hasText: f.partnerType })
    .filter({ hasText: f.report })
    .filter({ hasText: dateRangeText });
  if (completedOnly) loc = loc.filter({ hasText: /COMPLETED/i });
  return loc;
}

/**
 * Snapshot existing queue rows BEFORE clicking GENERATE REPORT, so we can
 * distinguish our new row from pre-existing ones with the same filters.
 */
export async function captureExistingRowSignatures(
  page: Page,
  f: ReportFilters,
  emit: EmitFn,
): Promise<Set<string>> {
  const log = createLogger(STAGE, emit);
  const rows = await buildRowLocator(page, f, false).all();

  const signatures = new Set<string>();
  for (const row of rows) {
    const text = await row.innerText().catch(() => '');
    const sig = normalizeRowSignature(text);
    if (sig) signatures.add(sig);
  }
  log.info(`Pre-submit: ${signatures.size} existing row(s) will be ignored`);
  return signatures;
}

/** Click GENERATE REPORT, with a force-click fallback when overlays intercept. */
export async function clickGenerateReport(page: Page, emit: EmitFn): Promise<void> {
  const log = createLogger(STAGE, emit);
  log.info('Clicking GENERATE REPORT');
  await dismissNotificationPopup(page);
  await dismissAnyPopup(page);

  const generateBtn = page.locator(SELECTORS.generateBtn).first();
  await generateBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await humanPause(page, 800, 1600);

  try {
    await generateBtn.click({ delay: rand(80, 160) });
  } catch {
    log.warn('  normal click blocked — retrying with force:true');
    await dismissAnyPopup(page);
    await generateBtn.click({ force: true, delay: rand(80, 160) });
  }

  // Let the backend enqueue the report job.
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
}

/**
 * Wait for a NEW COMPLETED row matching our filters, reloading every ~20s.
 * Returns the row locator. Throws AUTO_REPORT_TIMEOUT on deadline.
 */
export async function waitForCompletedRow(
  page: Page,
  f: ReportFilters,
  timeoutMs: number,
  excludeSignatures: Set<string>,
  emit: EmitFn,
): Promise<Locator> {
  const log = createLogger(STAGE, emit);
  const dateRangeText = `${f.startDate} - ${f.endDate}`;
  log.info(
    `Waiting for COMPLETED row: ${f.store} | ${f.partnerType} | ${f.report} | ${dateRangeText}`,
  );

  const deadline = Date.now() + timeoutMs;
  let lastReload = Date.now();

  while (Date.now() < deadline) {
    // Close any alert/info banner that popped up mid-wait so it can't intercept
    // the eventual DOWNLOAD click or abort the run.
    await dismissAlerts(page).catch(() => {});

    const candidates = await buildRowLocator(page, f, true).all();
    for (const row of candidates) {
      const text = await row.innerText().catch(() => '');
      const sig = normalizeRowSignature(text);
      if (!sig || excludeSignatures.has(sig)) continue;

      // Make sure the DOWNLOAD link is rendered too.
      if ((await row.locator(SELECTORS.rowDownloadLink).count()) > 0) {
        await row.scrollIntoViewIfNeeded().catch(() => {});
        return row;
      }
    }

    // Periodic reload to force a table refresh.
    if (Date.now() - lastReload > 20_000) {
      log.info('  (refreshing queue...)');
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      lastReload = Date.now();
    } else {
      await page.waitForTimeout(2000);
    }
  }

  throw new AppError(
    ErrorCode.AUTO_REPORT_TIMEOUT,
    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for a COMPLETED row.`,
  );
}
