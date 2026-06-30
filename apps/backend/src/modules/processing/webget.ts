import { logger } from '../../lib/logger.js';

/**
 * Webget dedup — mirrors the n8n "Collect All IDs" → "Bulk Webget Query" →
 * (parse) steps. Before submitting to CIMS we ask the Increff Webget SQL API
 * which channel_order_ids ALREADY exist, so those rows are marked SKIPPED
 * ("Already exists in CIMS") instead of being re-submitted.
 *
 * Auth is a custom-header credential ("Webget system user" in n8n). We carry it
 * as an arbitrary header map so the exact scheme is configurable without a code
 * change. If no auth headers are configured, dedup is SKIPPED (all rows are
 * submitted and CIMS decides) — logged loudly so it's never a silent gap.
 */
export interface WebgetConfig {
  url: string;
  schema: string;
  dbId: number;
  table: string;
  idColumn: string;
  channelColumn: string;
  channelId: string;
  authHeaders: Record<string, string> | null;
  timeoutMs: number;
  /** Max ids per Webget query (n8n "Split Myntra" batchSize). */
  batchSize: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Build the quoted SQL `IN (...)` list, escaping single quotes (n8n parity). */
export function buildWebgetSqlList(ids: string[]): string {
  const unique = [...new Set(ids.map((id) => String(id).trim()).filter((id) => id.length > 0))];
  return unique.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
}

/** Parse the Webget text response into a set of ids (n8n "Classify Rows" parity). */
export function parseWebgetIds(text: string, idColumn: string): Set<string> {
  const ids = new Set(
    String(text || '')
      .split(/[\t\n\r,]+/)
      .map((id) => id.trim().replace(/['"]/g, ''))
      .filter((id) => id.length > 0),
  );
  // Drop the column header token if Webget echoed it.
  ids.delete(idColumn);
  return ids;
}

/**
 * Return the set of sellerOrderIds that already exist in CIMS.
 * Returns an empty set (i.e. "dedup disabled") when no auth is configured or
 * there are no ids to check — callers then submit everything.
 */
export async function fetchExistingOrderIds(
  sellerOrderIds: string[],
  cfg: WebgetConfig,
): Promise<Set<string>> {
  if (!cfg.authHeaders) {
    logger.warn('Webget auth not configured — skipping CIMS dedup (all rows will be submitted)');
    return new Set();
  }

  const unique = [...new Set(sellerOrderIds.map((id) => String(id).trim()).filter(Boolean))];
  if (unique.length === 0) return new Set();

  const existing = new Set<string>();
  // Query in batches (n8n "Split Myntra" batchSize=3000) so a large report does
  // not produce one enormous IN(...) clause that is slow or rejected.
  for (const batch of chunk(unique, cfg.batchSize)) {
    const sqlList = buildWebgetSqlList(batch);
    if (!sqlList) continue;

    // Mirror the n8n query exactly (selects channel_order_id + return_order_id).
    const query =
      `SELECT ${cfg.idColumn},return_order_id FROM ${cfg.schema}.${cfg.table} ` +
      `WHERE ${cfg.channelColumn} = '${cfg.channelId}' AND ${cfg.idColumn} IN (${sqlList})`;

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
        // Don't fail the whole sync on a dedup hiccup — degrade to "submit all".
        logger.error({ status: res.status, body: text.slice(0, 200) }, 'Webget query failed — skipping dedup for batch');
        continue;
      }
      for (const id of parseWebgetIds(text, cfg.idColumn)) existing.add(id);
    } catch (err) {
      logger.error({ err }, 'Webget query errored — skipping dedup for batch');
    } finally {
      clearTimeout(timer);
    }
  }
  return existing;
}
