import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { reconstruct, safeString } from '../reconstruct.js';
import { AppError } from '@rg/shared';

// Canonical Myntra "Seller Returns Report" headers (snake_case, as the n8n
// xlsx extraction sees them).
const HEADER =
  'seller_order_id,order_id,seller_sku_code,quantity,type,return_reason,return_tracking_number,forward_tracking_number';

describe('reconstruct (Myntra report → ReturnRow)', () => {
  it('maps the canonical columns to ReturnRow', () => {
    const csv = [
      HEADER,
      '1001,RET-1,SKU-A,2,CUSTOMER_RETURN,Size issue,TRK-1,FWD-1',
      '1002,RET-2,SKU-B,,RTO,Damaged,,FWD-2',
    ].join('\n');

    const rows = reconstruct(Buffer.from(csv), 'MYNTRA', 'report.csv');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sellerOrderId: '1001',
      channelReturnOrderId: 'RET-1',
      sellerSkuCode: 'SKU-A',
      quantity: 2,
      type: 'CUSTOMER_RETURN',
      returnReason: 'Size issue',
      trackingId: 'TRK-1', // return_tracking_number preferred
    });
    // qty defaults to 1; falls back to forward_tracking_number
    expect(rows[1]).toMatchObject({ sellerOrderId: '1002', quantity: 1, trackingId: 'FWD-2' });
  });

  it('is case/space-insensitive on headers', () => {
    const csv = ['Seller_Order_ID, Order_Id , Seller_SKU_Code', '1003,RET-3,SKU-C'].join('\n');
    const rows = reconstruct(Buffer.from(csv), 'MYNTRA', 'r.csv');
    expect(rows[0]).toMatchObject({ sellerOrderId: '1003', channelReturnOrderId: 'RET-3', sellerSkuCode: 'SKU-C' });
  });

  it('null return_reason when blank', () => {
    const csv = [HEADER, '1004,RET-4,SKU-D,1,CUSTOMER_RETURN,,,'].join('\n');
    const rows = reconstruct(Buffer.from(csv), 'MYNTRA', 'r.csv');
    expect(rows[0]?.returnReason).toBeNull();
  });

  it('throws PROC_PARSE_FAILED on an empty report', () => {
    expect(() => reconstruct(Buffer.from(HEADER + '\n'), 'MYNTRA', 'r.csv')).toThrow(AppError);
  });
});

describe('reconstruct (XLSX) preserves long numeric IDs (no scientific notation)', () => {
  it('keeps the full 12-digit order_id and numeric tracking id', () => {
    // Build an XLSX where order_id + tracking are NUMERIC cells, as Myntra exports.
    // RTO rows take the FORWARD tracking number (per the n8n mapping).
    const aoa = [
      ['seller_order_id', 'order_id', 'seller_sku_code', 'quantity', 'type', 'forward_tracking_number'],
      ['41f2746b-uuid', 100094123456, 'JE6913_210', 1, 'RTO', 5965620000000],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const rows = reconstruct(buf, 'MYNTRA', 'report.xlsx');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.channelReturnOrderId).toBe('100094123456'); // NOT "1.00094E+11"
    expect(rows[0]!.channelReturnOrderId).not.toMatch(/[eE]\+/);
    expect(rows[0]!.trackingId).toBe('5965620000000'); // NOT "5.96562E+12"
    expect(rows[0]!.sellerOrderId).toBe('41f2746b-uuid');
  });
});

describe('safeString', () => {
  it('renders large numeric ids without grouping or scientific notation', () => {
    expect(safeString(1100149519)).toBe('1100149519');
    expect(safeString(12345678901234)).toBe('12345678901234');
    expect(safeString('  X-1 ')).toBe('X-1');
    expect(safeString(null)).toBe('');
  });
});
