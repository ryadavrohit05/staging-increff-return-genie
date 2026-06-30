import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Marketplace } from '@rg/shared';
import { AppError, ErrorCode } from '@rg/shared';

/**
 * Normalized return row produced from a raw marketplace report.
 *
 * Field mapping mirrors the proven n8n workflow ("Convert Binary to JSON" →
 * "Format JSON Payload") so the downstream CIMS payload is byte-identical to
 * what production already submits. Myntra exports an XLSX with snake_case
 * headers; we also accept CSV transparently.
 *
 * Source columns (Myntra "Seller Returns Report"):
 *   seller_order_id, order_id, seller_sku_code, quantity, type,
 *   return_reason, return_tracking_number, forward_tracking_number
 */
export interface ReturnRow {
  /** seller_order_id → CIMS channelOrderId + the Webget dedup key. */
  sellerOrderId: string;
  /** order_id → CIMS channelReturnOrderId. */
  channelReturnOrderId: string;
  /** seller_sku_code → CIMS channelSku. */
  sellerSkuCode: string;
  /** quantity (defaults to 1). */
  quantity: number;
  /** type (used to detect RTO vs customer return). */
  type: string;
  /** return_reason → CIMS reasonForReturn. */
  returnReason: string | null;
  /** return_tracking_number || forward_tracking_number → CIMS trackingId. */
  trackingId: string;
  /** 1-based source row index for tracing. */
  sourceIndex: number;
  /** Untouched original record. */
  raw: Record<string, string>;
}

/**
 * Stringify a cell value the way the n8n workflow does — critically, large
 * numeric order IDs must NOT come out in scientific notation or with grouping
 * separators (`toLocaleString('fullwide', { useGrouping: false })`).
 */
export function safeString(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') return val.toLocaleString('fullwide', { useGrouping: false });
  return String(val).trim();
}

function isXlsx(buffer: Buffer): boolean {
  // XLSX is a ZIP archive → magic bytes 'PK\x03\x04'.
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Build a record keyed by normalized header so lookups tolerate case/space drift. */
function normalizeRecord(rec: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(rec)) out[normalizeKey(key)] = safeString(rec[key]);
  return out;
}

function rowsFromXlsx(buffer: Buffer): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  // CRITICAL: raw:true returns the underlying cell VALUES (numbers stay numbers),
  // NOT the display text. The display text for a 12-digit order_id is scientific
  // notation ("1.00094E+11"), which collapses distinct return IDs into the same
  // value and makes CIMS reject them as duplicates. JS holds these integers
  // exactly (< 2^53), and safeString() then renders the full digits. Using
  // raw:false here was the cause of the "Duplicate Channel Orders" failures.
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: true,
    defval: '',
  });
  return json.map(normalizeRecord);
}

function rowsFromCsv(buffer: Buffer): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(buffer.toString('utf8'), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length > 0) {
    const fatal = parsed.errors.find((e) => e.type === 'Delimiter' || e.type === 'Quotes');
    if (fatal && (!parsed.data || parsed.data.length === 0)) {
      throw new AppError(ErrorCode.PROC_PARSE_FAILED, `CSV parse error: ${fatal.message}`);
    }
  }
  return (parsed.data ?? []).map(normalizeRecord);
}

/**
 * Parse a report buffer (XLSX or CSV) into normalized return rows.
 * Pure + unit-testable: no network, no DB. Throws PROC_PARSE_FAILED on no data.
 */
export function reconstruct(
  buffer: Buffer,
  _marketplace: Marketplace,
  filename?: string,
): ReturnRow[] {
  const xlsx = isXlsx(buffer) || /\.xlsx?$/i.test(filename ?? '');
  const records = xlsx ? rowsFromXlsx(buffer) : rowsFromCsv(buffer);

  if (records.length === 0) {
    throw new AppError(ErrorCode.PROC_PARSE_FAILED, 'Report contained no data rows');
  }

  const rows: ReturnRow[] = [];
  records.forEach((rec, i) => {
    if (Object.values(rec).every((v) => v === '')) return; // wholly-empty row

    const get = (k: string) => rec[normalizeKey(k)] ?? '';
    const returnTracking = get('return_tracking_number');
    const forwardTracking = get('forward_tracking_number');
    // Per the n8n "Find Missing Myntra" mapping: RTO uses the FORWARD tracking
    // number, a customer return uses the RETURN tracking number.
    const isRTO = get('type').toUpperCase().includes('RTO');

    rows.push({
      sellerOrderId: get('seller_order_id'),
      channelReturnOrderId: get('order_id'),
      sellerSkuCode: get('seller_sku_code'),
      quantity: Number.parseInt(get('quantity'), 10) || 1,
      type: get('type'),
      returnReason: get('return_reason') ? get('return_reason') : null,
      trackingId: isRTO ? forwardTracking : returnTracking,
      sourceIndex: i + 1,
      raw: rec,
    });
  });

  return rows;
}
