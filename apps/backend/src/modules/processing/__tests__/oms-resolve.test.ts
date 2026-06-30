import { describe, it, expect } from 'vitest';
import { parseOmsRows, type OmsResolveConfig } from '../oms-resolve.js';

const cfg: OmsResolveConfig = {
  url: 'https://saas.increff.com/webget/in/api/app/sql/result',
  schema: 'oms',
  dbId: 162,
  table: 'oms_sub_orders',
  idColumn: 'channel_order_id',
  fulfillmentColumn: 'fulfillmentLocationCode',
  channelColumn: 'channel_id',
  authHeaders: { authUsername: 'u', authPassword: 'p', authOrgName: 'o' },
  timeoutMs: 120000,
  batchSize: 3000,
};

describe('parseOmsRows', () => {
  it('parses tab-separated output WITH a header (column order independent)', () => {
    const text =
      'channel_order_id\tchannel_id\tfulfillmentLocationCode\n' +
      '1001\tMYNTRAV4\t8713-1\n' +
      '1002\tMYNTRAV4\t8713-2\n';
    const rows = parseOmsRows(text, cfg);
    expect(rows).toEqual([
      { channelOrderId: '1001', fulfillmentLocationCode: '8713-1', channelId: 'MYNTRAV4' },
      { channelOrderId: '1002', fulfillmentLocationCode: '8713-2', channelId: 'MYNTRAV4' },
    ]);
  });

  it('parses comma-separated output WITHOUT a header (SELECT positional order)', () => {
    // SELECT channel_order_id, fulfillmentLocationCode, channel_id
    const text = '1001,8713-1,MYNTRAV4\n1002,8713-2,MYNTRAV4';
    const rows = parseOmsRows(text, cfg);
    expect(rows).toEqual([
      { channelOrderId: '1001', fulfillmentLocationCode: '8713-1', channelId: 'MYNTRAV4' },
      { channelOrderId: '1002', fulfillmentLocationCode: '8713-2', channelId: 'MYNTRAV4' },
    ]);
  });

  it('parses a JSON array of objects (keys case-insensitive)', () => {
    const text = JSON.stringify([
      { channel_order_id: '1001', fulfillmentLocationCode: '8713-1', channel_id: 'MYNTRAV4' },
      { CHANNEL_ORDER_ID: '1002', FULFILLMENTLOCATIONCODE: '8713-2', CHANNEL_ID: 'CH-B' },
    ]);
    const rows = parseOmsRows(text, cfg);
    expect(rows).toEqual([
      { channelOrderId: '1001', fulfillmentLocationCode: '8713-1', channelId: 'MYNTRAV4' },
      { channelOrderId: '1002', fulfillmentLocationCode: '8713-2', channelId: 'CH-B' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseOmsRows('', cfg)).toEqual([]);
    expect(parseOmsRows('   \n  ', cfg)).toEqual([]);
  });

  it('strips surrounding quotes from cells', () => {
    const text = '"1001","8713-1","MYNTRAV4"';
    expect(parseOmsRows(text, cfg)).toEqual([
      { channelOrderId: '1001', fulfillmentLocationCode: '8713-1', channelId: 'MYNTRAV4' },
    ]);
  });
});
