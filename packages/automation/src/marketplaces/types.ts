/**
 * The contract every marketplace implementation conforms to. Adding a new
 * marketplace (Flipkart, …) is a new `MarketplaceAdapter` + selectors file with
 * no core changes (ARCHITECTURE.md §18 — scaling strategy).
 */

import type { Page } from 'playwright';
import type { EmitFn } from '../engine/logger.js';

/** The normalized job an adapter executes. Mirrors the public `AutomationJob`. */
export interface AdapterJob {
  syncRunId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  email: string;
  password: string;
  downloadDir: string;
  screenshotDir: string;
  /** Cancellation signal — adapters should poll this and throw AUTO_CANCELLED. */
  signal?: AbortSignal;
}

export interface AdapterResult {
  reportPath: string; // absolute path to the downloaded report
  filename: string;
  downloadedAt: string; // ISO
}

export interface MarketplaceAdapter {
  /** Stable marketplace id. */
  readonly id: 'MYNTRA' | 'FLIPKART';
  /** The reports landing URL (also the navigation entry point). */
  readonly reportsUrl: string;
  /** Execute the full leg: login → navigate → dates → generate → download. */
  run(page: Page, job: AdapterJob, emit: EmitFn): Promise<AdapterResult>;
}
