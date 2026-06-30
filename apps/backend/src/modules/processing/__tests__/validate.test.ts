import { describe, it, expect } from 'vitest';
import { validateRows } from '../validate.js';
import type { ReturnRow } from '../reconstruct.js';

function row(partial: Partial<ReturnRow>): ReturnRow {
  return {
    sellerOrderId: '1001',
    channelReturnOrderId: 'RET-1',
    sellerSkuCode: 'SKU-A',
    quantity: 1,
    type: 'CUSTOMER_RETURN',
    returnReason: null,
    trackingId: '',
    sourceIndex: 1,
    raw: {},
    ...partial,
  };
}

describe('validateRows', () => {
  it('passes rows with a seller_order_id', () => {
    const { valid, invalid } = validateRows([row({}), row({ sellerOrderId: '1002' })]);
    expect(valid).toHaveLength(2);
    expect(invalid).toHaveLength(0);
  });

  it('skips rows missing seller_order_id', () => {
    const { valid, invalid } = validateRows([row({ sellerOrderId: '' }), row({ sellerOrderId: '1003' })]);
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]?.reasons).toContain('Missing seller_order_id in row');
  });
});
