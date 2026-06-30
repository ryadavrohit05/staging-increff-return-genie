import { describe, it, expect } from 'vitest';
import {
  buildCimsPayload,
  buildCimsGroupPayload,
  classifyCimsResponse,
  hostFromClient,
  domainFromClient,
  type ResolvedExternalConfig,
} from '../external-api.js';
import type { ReturnRow } from '../reconstruct.js';

const cfg: ResolvedExternalConfig = {
  client: 'adidasgcc',
  baseUrl: 'https://adidasgcc.omni.increff.com',
  returnOrdersPath: '/cims/import/returnOrders',
  authHeaders: { authUsername: 'adidasgcc-system.user', authPassword: 'x', authDomainName: 'adidasgcc-oltp' },
  cims: {
    omsLocationId: 1100149519,
    fulfillmentLocationCode: '8713-1',
    clientId: 1100149303,
    channelId: 'MYNTRAV4',
    timeoutMs: 60000,
  },
  webget: {
    url: 'https://saas.increff.com/webget/in/api/app/sql/result',
    schema: 'cims',
    dbId: 559,
    table: 'cims_return_order_pojo',
    idColumn: 'channel_order_id',
    channelColumn: 'channel_id',
    channelId: 'MYNTRAV4',
    authHeaders: null,
    timeoutMs: 120000,
    batchSize: 3000,
  },
};

function row(p: Partial<ReturnRow>): ReturnRow {
  return {
    sellerOrderId: '1001',
    channelReturnOrderId: 'RET-1',
    sellerSkuCode: 'SKU-A',
    quantity: 2,
    type: 'CUSTOMER_RETURN',
    returnReason: 'Size issue',
    trackingId: 'TRK-1',
    sourceIndex: 1,
    raw: {},
    ...p,
  };
}

describe('slug-driven derivation', () => {
  it('derives host and domain from a client slug', () => {
    expect(hostFromClient('adidasgcc')).toBe('https://adidasgcc.omni.increff.com');
    expect(domainFromClient('nike')).toBe('nike-oltp');
  });
});

describe('buildCimsPayload (n8n "Format JSON Payload" parity)', () => {
  it('produces the exact CIMS body for a customer return', () => {
    const payload = buildCimsPayload(row({}), cfg);
    expect(payload).toEqual({
      omsLocationId: 1100149519,
      fulfillmentLocationCode: '8713-1',
      clientId: 1100149303,
      channelId: 'MYNTRAV4',
      channelReturnOrderId: 'RET-1',
      forms: [
        {
          channelOrderId: '1001',
          channelSubOrderId: null,
          channelReturnOrderId: 'RET-1',
          channelSku: 'SKU-A',
          returnOrderType: 'CUSTOMER_RETURN',
          transporter: null,
          trackingId: 'TRK-1',
          reasonForReturn: 'Size issue',
          quantity: 2,
        },
      ],
    });
  });

  it('detects RTO from the type column', () => {
    const p = buildCimsPayload(row({ type: 'RTO_RETURN' }), cfg) as { forms: Array<{ returnOrderType: string }> };
    expect(p.forms[0]!.returnOrderType).toBe('RETURN_TO_ORIGIN');
  });
});

describe('buildCimsGroupPayload (multi-item return order → one request, many forms)', () => {
  it('groups line items under a single channelReturnOrderId', () => {
    const rows = [
      row({ sellerOrderId: 'uuid-1', channelReturnOrderId: '100094123456', sellerSkuCode: 'A' }),
      row({ sellerOrderId: 'uuid-2', channelReturnOrderId: '100094123456', sellerSkuCode: 'B' }),
    ];
    const p = buildCimsGroupPayload(rows, cfg) as {
      channelReturnOrderId: string;
      forms: Array<{ channelOrderId: string; channelSku: string }>;
    };
    expect(p.channelReturnOrderId).toBe('100094123456');
    expect(p.forms).toHaveLength(2);
    expect(p.forms.map((f) => f.channelOrderId)).toEqual(['uuid-1', 'uuid-2']);
    expect(p.forms.map((f) => f.channelSku)).toEqual(['A', 'B']);
  });
});

describe('classifyCimsResponse (n8n "Build Result" parity)', () => {
  it('2xx → SUCCESS', () => {
    expect(classifyCimsResponse(200, '{}', '1001')).toEqual({ orderId: '1001', status: 'SUCCESS', error: null });
  });

  it('parses message + description + field errors on failure', () => {
    const body = JSON.stringify({
      message: 'Validation failed',
      description: 'bad request',
      errors: [{ field: 'channelSku', message: 'unknown sku' }],
    });
    const r = classifyCimsResponse(400, body, '1002');
    expect(r.status).toBe('FAILED');
    expect(r.error).toBe('Validation failed | bad request | [channelSku: unknown sku]');
  });

  it('falls back to HTTP <code> when the body is unhelpful', () => {
    expect(classifyCimsResponse(500, 'not json', '1003').error).toBe('not json');
    expect(classifyCimsResponse(503, '{}', '1004').error).toBe('HTTP 503');
  });
});
