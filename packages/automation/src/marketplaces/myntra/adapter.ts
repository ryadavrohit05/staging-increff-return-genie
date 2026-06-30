/**
 * Myntra marketplace adapter — orchestrates the full Operational Reports leg:
 * navigate → detect auth → fresh login → wait for reports page → dismiss popups
 * → select dropdowns → fill dates → generate → wait for COMPLETED → download.
 *
 * Emits `SyncPhase` milestones (ARCHITECTURE.md §15) and `[Myntra]` log lines at
 * each step so the desktop timeline mirrors the reference dashboard exactly.
 */

import { promises as fs } from 'node:fs';
import type { Page } from 'playwright';
import { AppError, ErrorCode, SyncPhase } from '@rg/shared';
import { humanPause } from '../../engine/humanize.js';
import { dumpDebugSnapshot } from '../../engine/snapshot.js';
import { createLogger, type EmitFn } from '../../engine/logger.js';
import type { AdapterJob, AdapterResult, MarketplaceAdapter } from '../types.js';
import { MyntraConfig, STAGE } from './config.js';
import { DEFAULTS, LABELS, REPORTS_URL } from './selectors.js';
import { detectAuthState, performLogin } from './login.js';
import { selectField, waitForReportsPage } from './navigate.js';
import { fillDateRange } from './dates.js';
import {
  captureExistingRowSignatures,
  clickGenerateReport,
  waitForCompletedRow,
  type ReportFilters,
} from './generate.js';
import { downloadReport } from './download.js';
import {
  dismissNotificationPopup,
  onReportsPage,
  startAlertWatcher,
  throwIfAborted,
} from './helpers.js';

export class MyntraAdapter implements MarketplaceAdapter {
  readonly id = 'MYNTRA' as const;
  readonly reportsUrl = REPORTS_URL;

  async run(page: Page, job: AdapterJob, emit: EmitFn): Promise<AdapterResult> {
    const log = createLogger(STAGE, emit);
    const { startDate, endDate, email, password, downloadDir, screenshotDir, signal, automationMode } =
      job;

    const store = DEFAULTS.store;
    const partnerType = DEFAULTS.partnerType;
    const report = DEFAULTS.report;
    const filters: ReportFilters = { store, partnerType, report, startDate, endDate };

    await fs.mkdir(downloadDir, { recursive: true });
    await fs.mkdir(screenshotDir, { recursive: true });

    // Surface auth-related network failures (reference parity).
    page.on('requestfailed', (req) => {
      const fail = req.failure()?.errorText || 'unknown';
      log.warn(`  net XXX ${req.method()} ${req.url()} — ${fail}`);
    });

    // Continuously close any Myntra alert/info banner (e.g. aui-banner-info) that
    // pops up mid-run, so it can never intercept a click or abort the download.
    const stopAlertWatcher = startAlertWatcher(page);

    try {
      // ── Step 1: navigate ───────────────────────────────────────────────
      emit({ type: 'phase', ts: Date.now(), phase: SyncPhase.MYNTRA_STARTING });
      log.info(`Opening ${REPORTS_URL}`);
      await page.goto(REPORTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      throwIfAborted(signal);

      // ── Step 2: detect auth state ──────────────────────────────────────
      const state = await detectAuthState(page);
      log.info(`Auth state: ${state} | URL: ${page.url()}`);

      if (state === 'error_page') {
        const shot = await dumpDebugSnapshot(page, 'error-page', screenshotDir);
        if (shot) log.screenshot(shot);
        throw new AppError(
          ErrorCode.AUTO_NAV_FAILED,
          'Myntra returned a "Site Maintenance" page instead of the login form. ' +
            'The runner IP may be blocked. Set MYNTRA_PROXY_URL to route through an unblocked proxy.',
        );
      }

      // ── Step 3: reach the reports page ─────────────────────────────────
      // Two paths converge on the SAME reports-page state; everything after is
      // identical. AUTO_LOGIN drives the login form; MANUAL_LOGIN hands the
      // browser to the user and waits until they reach the report page.
      if (state === 'reports') {
        log.info('Already on reports page (unexpected but OK).');
      } else if (automationMode === 'MANUAL_LOGIN') {
        emit({ type: 'phase', ts: Date.now(), phase: SyncPhase.MYNTRA_AWAITING_MANUAL_LOGIN });
        log.info(
          'Manual login mode — please sign in to Myntra in the open browser and ' +
            'navigate to the Seller Returns Report page. Automation will resume automatically.',
        );
        // Poll for the reports page for as long as a human reasonably needs.
        await waitForReportsPage(page, MyntraConfig.manualLoginTimeoutMs, screenshotDir, emit);
      } else {
        // AUTO_LOGIN — original behavior, unchanged.
        emit({ type: 'phase', ts: Date.now(), phase: SyncPhase.MYNTRA_LOGGING_IN });
        await performLogin(page, email, password, screenshotDir, emit);
        throwIfAborted(signal);

        await page.waitForURL(/partners\.myntrainfo\.com/i, { timeout: 60_000 }).catch(() => {});
        if (!onReportsPage(page)) {
          log.info('Navigating to reports page after login...');
          await page
            .goto(REPORTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
            .catch(() => {});
        }

        await waitForReportsPage(page, MyntraConfig.loginTimeoutMs, screenshotDir, emit);
      }
      emit({ type: 'phase', ts: Date.now(), phase: SyncPhase.MYNTRA_AUTHENTICATED });
      throwIfAborted(signal);

      // ── Step 4: dismiss popups ─────────────────────────────────────────
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await dismissNotificationPopup(page);
      await humanPause(page, 1000, 2000);

      // ── Step 5: fill the three dropdowns ───────────────────────────────
      emit({ type: 'phase', ts: Date.now(), phase: SyncPhase.MYNTRA_FILLING_FORM });
      await selectField(page, LABELS.store, store, 0, emit);
      await selectField(page, LABELS.partnerType, partnerType, 1, emit);
      await selectField(page, LABELS.report, report, 2, emit);
      await humanPause(page, 800, 1600);
      throwIfAborted(signal);

      // ── Step 6: fill the date range ────────────────────────────────────
      emit({ type: 'phase', ts: Date.now(), phase: SyncPhase.MYNTRA_SETTING_DATES });
      await fillDateRange(page, startDate, endDate, screenshotDir, emit);
      await humanPause(page, 1000, 2000);
      throwIfAborted(signal);

      // ── Step 7: GENERATE REPORT ────────────────────────────────────────
      emit({ type: 'phase', ts: Date.now(), phase: SyncPhase.MYNTRA_GENERATING });
      const preSubmitSignatures = await captureExistingRowSignatures(page, filters, emit);
      await clickGenerateReport(page, emit);
      throwIfAborted(signal);

      // ── Step 8: wait for COMPLETED row ─────────────────────────────────
      emit({ type: 'phase', ts: Date.now(), phase: SyncPhase.MYNTRA_WAITING_REPORT });
      const completedRow = await waitForCompletedRow(
        page,
        filters,
        MyntraConfig.reportTimeoutMs,
        preSubmitSignatures,
        emit,
      );
      throwIfAborted(signal);

      // ── Step 9: download ───────────────────────────────────────────────
      emit({ type: 'phase', ts: Date.now(), phase: SyncPhase.MYNTRA_DOWNLOADING });
      const result = await downloadReport(
        page,
        completedRow,
        { report, startDate, endDate, downloadDir },
        emit,
      );

      return result;
    } catch (err) {
      // On any step failure, capture forensics and surface the screenshot.
      if (!(err instanceof AppError) || err.code !== ErrorCode.AUTO_CANCELLED) {
        const shot = await dumpDebugSnapshot(page, 'failure', screenshotDir);
        if (shot) log.screenshot(shot);
      }
      throw err;
    } finally {
      stopAlertWatcher();
    }
  }
}

export const myntraAdapter = new MyntraAdapter();
