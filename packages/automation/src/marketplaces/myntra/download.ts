/**
 * Myntra report download capture — ported from the reference download step.
 *
 * Robust capture: `page.waitForEvent('download')` raced with the DOWNLOAD click
 * in a `Promise.all` so we never miss the download event. The saved filename is
 * timestamped and tagged with the report + date range for traceability.
 */

import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { AppError, ErrorCode } from '@rg/shared';
import { createLogger, type EmitFn } from '../../engine/logger.js';
import { STAGE } from './config.js';
import { SELECTORS } from './selectors.js';
import { dismissAlerts } from './helpers.js';
import type { AdapterResult } from '../types.js';

export interface DownloadParams {
  report: string;
  startDate: string;
  endDate: string;
  downloadDir: string;
}

/**
 * Click the DOWNLOAD link in `completedRow` and save the captured file.
 */
export async function downloadReport(
  page: Page,
  completedRow: Locator,
  params: DownloadParams,
  emit: EmitFn,
): Promise<AdapterResult> {
  const log = createLogger(STAGE, emit);
  log.info('Report COMPLETED — clicking DOWNLOAD');

  // Clear any alert/info banner that could intercept the DOWNLOAD click.
  await dismissAlerts(page).catch(() => {});

  const downloadLink = completedRow.locator(SELECTORS.rowDownloadLink).first();
  await downloadLink.waitFor({ state: 'visible', timeout: 30_000 });

  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      downloadLink.click({ delay: 60 }),
    ]);

    const suggested = download.suggestedFilename() || `${params.report}.csv`;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = `${stamp}__${params.report}__${params.startDate}_to_${params.endDate}__${suggested}`;
    const savedPath = path.join(params.downloadDir, safeName);

    await download.saveAs(savedPath);
    log.info(`Saved: ${savedPath}`);

    return {
      reportPath: savedPath,
      filename: safeName,
      downloadedAt: new Date().toISOString(),
    };
  } catch (e) {
    throw new AppError(
      ErrorCode.AUTO_DOWNLOAD_FAILED,
      `Failed to capture the report download: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
