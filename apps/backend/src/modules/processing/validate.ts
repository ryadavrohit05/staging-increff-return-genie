import type { ReturnRow } from './reconstruct.js';

export interface InvalidRow {
  row: ReturnRow;
  reasons: string[];
}

export interface ValidationOutcome {
  valid: ReturnRow[];
  invalid: InvalidRow[];
}

/**
 * Validate return rows. Pure + unit-testable. Mirrors the n8n "Classify Rows"
 * pre-check: the only hard rule is a present `seller_order_id`. A blank one is
 * SKIPPED ("Missing seller_order_id in row"), never fatal. Duplicate-in-CIMS
 * detection is a separate step (Webget dedup), not validation.
 */
export function validateRows(rows: ReturnRow[]): ValidationOutcome {
  const valid: ReturnRow[] = [];
  const invalid: InvalidRow[] = [];

  for (const row of rows) {
    if (!row.sellerOrderId) {
      invalid.push({ row, reasons: ['Missing seller_order_id in row'] });
    } else {
      valid.push(row);
    }
  }

  return { valid, invalid };
}
