/**
 * Flipkart adapter — stub. Conforms to `MarketplaceAdapter` so the engine and
 * the desktop can already select it, but throws until implemented. A real
 * implementation is a new selectors file + step modules with no core changes
 * (ARCHITECTURE.md §18).
 */

import type { Page } from 'playwright';
import { AppError, ErrorCode } from '@rg/shared';
import type { EmitFn } from '../../engine/logger.js';
import type { AdapterJob, AdapterResult, MarketplaceAdapter } from '../types.js';

export class FlipkartAdapter implements MarketplaceAdapter {
  readonly id = 'FLIPKART' as const;
  readonly reportsUrl = 'https://seller.flipkart.com/';

  async run(_page: Page, _job: AdapterJob, _emit: EmitFn): Promise<AdapterResult> {
    throw new AppError(ErrorCode.AUTO_UNKNOWN, 'Flipkart not yet implemented');
  }
}

export const flipkartAdapter = new FlipkartAdapter();
