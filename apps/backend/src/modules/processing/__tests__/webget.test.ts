import { describe, it, expect } from 'vitest';
import { buildWebgetSqlList, parseWebgetIds } from '../webget.js';

describe('buildWebgetSqlList', () => {
  it('dedupes, trims, quotes and escapes ids', () => {
    expect(buildWebgetSqlList(['1001', ' 1002 ', '1001', ''])).toBe("'1001','1002'");
    expect(buildWebgetSqlList(["O'Brien"])).toBe("'O''Brien'");
  });

  it('returns empty string when there are no ids', () => {
    expect(buildWebgetSqlList([])).toBe('');
  });
});

describe('parseWebgetIds', () => {
  it('splits on tabs/newlines/commas, strips quotes, drops the header token', () => {
    const text = 'channel_order_id\n1001\n1002\t1003,"1004"';
    const ids = parseWebgetIds(text, 'channel_order_id');
    expect([...ids].sort()).toEqual(['1001', '1002', '1003', '1004']);
    expect(ids.has('channel_order_id')).toBe(false);
  });

  it('handles an empty response', () => {
    expect(parseWebgetIds('', 'channel_order_id').size).toBe(0);
  });
});
