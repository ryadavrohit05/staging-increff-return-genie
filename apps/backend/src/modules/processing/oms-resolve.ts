import { logger } from '../../lib/logger.js';
import { buildWebgetSqlList } from './webget.js';

/**
 * OMS channel/fulfillment resolution (multi-tenant).
 *
 * After Webget dedup the backend holds the orders that are NOT already in CIMS.
 * For those, it asks the Increff Webget SQL API (the same transport used by the
 * dedup step) which channel + fulfillment each order belongs to:
 *
 *   SELECT channel_order_id, fulfillmentLocationCode, channel_id
 *   FROM   oms.oms_sub_orders
 *   WHERE  channel_order_id IN (...);
 *
 * Returns a map keyed by channel_order_id. `clientId` is NEVER read here — it is
 * the org's stored configuration. `omsLocationId` is not queried either: callers
 * set it equal to `fulfillmentLocationCode`.
 *
 * Unlike dedup (which can safely degrade to "submit all"), a missing channel /
 * fulfillment cannot be defaulted — callers SKIP those orders rather than submit
 * an incomplete payload.
 */
export interface SubOrderResolution {
  channelId: string;
  fulfillmentLocationCode: string;
}

export interface OmsResolveConfig {
  /** Webget SQL API URL (same endpoint as the dedup query). */
  url: string;
  /** Schema holding the sub-orders table (default "oms"). */
  schema: string;
  /** Per-org Webget dbId (source of truth = organization configuration). */
  dbId: number;
  /** Table name (default "oms_sub_orders"). */
  table: string;
  /** Channel-order-id column (the lookup key / join key). */
  idColumn: string;
  /** Fulfillment location code column. */
  fulfillmentColumn: string;
  /** Channel id column. */
  channelColumn: string;
  /** Custom-auth headers (same scheme as Webget dedup). */
  authHeaders: Record<string, string> | null;
  timeoutMs: number;
  /** Max ids per query (mirrors the Webget batch size). */
  batchSize: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function stripCell(v: string): string {
  return v.trim().replace(/^["']|["']$/g, '');
}

interface ParsedRow {
  channelOrderId: string;
  fulfillmentLocationCode: string;
  channelId: string;
}

/**
 * Parse the Webget response into structured rows. The API returns text; we
 * defensively accept either JSON (array of objects / array of arrays) or a
 * delimited table (tab- or comma-separated, with or without a header row). When
 * a header is present, columns are matched by name (case-insensitive); without a
 * header we fall back to the SELECT order: id, fulfillment, channel.
 */
export function parseOmsRows(text: string, cfg: OmsResolveConfig): ParsedRow[] {
  const body = String(text ?? '').trim();
  if (!body) return [];

  const idKey = norm(cfg.idColumn);
  const fulfilKey = norm(cfg.fulfillmentColumn);
  const chanKey = norm(cfg.channelColumn);

  // 1) JSON forms.
  if (body.startsWith('[') || body.startsWith('{')) {
    try {
      const json = JSON.parse(body) as unknown;
      const arr = Array.isArray(json)
        ? json
        : Array.isArray((json as { data?: unknown[] }).data)
          ? (json as { data: unknown[] }).data
          : Array.isArray((json as { rows?: unknown[] }).rows)
            ? (json as { rows: unknown[] }).rows
            : null;
      if (arr) {
        const out: ParsedRow[] = [];
        for (const item of arr) {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const rec: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
              rec[norm(k)] = v;
            }
            const channelOrderId = stripCell(String(rec[idKey] ?? ''));
            const fulfillmentLocationCode = stripCell(String(rec[fulfilKey] ?? ''));
            const channelId = stripCell(String(rec[chanKey] ?? ''));
            if (channelOrderId) out.push({ channelOrderId, fulfillmentLocationCode, channelId });
          }
        }
        if (out.length > 0) return out;
      }
    } catch {
      logger.warn('OMS resolve: response looked like JSON but failed to parse — falling back to delimited');
    }
  }

  // 2) Delimited text.
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const delimiter = (lines[0] ?? '').includes('\t') ? '\t' : ',';
  const split = (line: string): string[] => line.split(delimiter).map(stripCell);

  // Header detection: does the first row name the id column?
  const firstCells = split(lines[0] ?? '').map(norm);
  const hasHeader = firstCells.includes(idKey);

  let idIdx = 0;
  let fulfilIdx = 1;
  let chanIdx = 2;
  let dataLines = lines;

  if (hasHeader) {
    idIdx = firstCells.indexOf(idKey);
    fulfilIdx = firstCells.indexOf(fulfilKey);
    chanIdx = firstCells.indexOf(chanKey);
    dataLines = lines.slice(1);
  }

  const out: ParsedRow[] = [];
  for (const line of dataLines) {
    const cells = split(line);
    const channelOrderId = idIdx >= 0 ? (cells[idIdx] ?? '') : '';
    const fulfillmentLocationCode = fulfilIdx >= 0 ? (cells[fulfilIdx] ?? '') : '';
    const channelId = chanIdx >= 0 ? (cells[chanIdx] ?? '') : '';
    if (channelOrderId) out.push({ channelOrderId, fulfillmentLocationCode, channelId });
  }
  return out;
}

/**
 * Resolve channel + fulfillment for a set of channel-order-ids. Orders with no
 * row in oms_sub_orders are simply absent from the returned map (callers SKIP
 * them). A failed batch is logged and skipped rather than aborting the whole run.
 */
export async function resolveSubOrders(
  channelOrderIds: string[],
  cfg: OmsResolveConfig,
): Promise<Map<string, SubOrderResolution>> {
  const result = new Map<string, SubOrderResolution>();

  const unique = [...new Set(channelOrderIds.map((id) => String(id).trim()).filter(Boolean))];
  if (unique.length === 0) return result;

  if (!cfg.authHeaders) {
    logger.error(
      'OMS resolve: Webget auth not configured — cannot resolve channel/fulfillment; affected orders will be skipped',
    );
    return result;
  }

  for (const batch of chunk(unique, cfg.batchSize)) {
    const sqlList = buildWebgetSqlList(batch);
    if (!sqlList) continue;

    const query =
      `SELECT ${cfg.idColumn},${cfg.fulfillmentColumn},${cfg.channelColumn} ` +
      `FROM ${cfg.schema}.${cfg.table} ` +
      `WHERE ${cfg.idColumn} IN (${sqlList})`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', ...cfg.authHeaders },
        body: JSON.stringify({ schema: cfg.schema, dbId: cfg.dbId, action: 'QUERY', query }),
      });
      const text = await res.text();
      if (res.status < 200 || res.status >= 300) {
        logger.error(
          { status: res.status, body: text.slice(0, 200) },
          'OMS resolve: query failed for batch — affected orders will be skipped',
        );
        continue;
      }
      for (const row of parseOmsRows(text, cfg)) {
        // Only the columns we asked for; ignore rows without a usable channel.
        if (!row.channelId || !row.fulfillmentLocationCode) continue;
        // First write wins; sub-orders of one channel order share channel/fulfillment.
        if (!result.has(row.channelOrderId)) {
          result.set(row.channelOrderId, {
            channelId: row.channelId,
            fulfillmentLocationCode: row.fulfillmentLocationCode,
          });
        }
      }
    } catch (err) {
      logger.error({ err }, 'OMS resolve: query errored for batch — affected orders will be skipped');
    } finally {
      clearTimeout(timer);
    }
  }

  return result;
}
