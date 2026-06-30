import { AppError, ErrorCode, type RowStatus } from '@rg/shared';
import { env } from '../../env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { decryptSecret } from '../../lib/crypto.js';
import type { ReturnRow } from './reconstruct.js';
import type { WebgetConfig } from './webget.js';

/**
 * ★ THE ONLY place external upload-API credentials are read (ARCHITECTURE.md §11).
 *
 * Faithful reimplementation of the proven n8n workflow's "Format JSON Payload" →
 * "Submit to CIMS" → "Build Result" nodes. Each return order is POSTed
 * individually to:
 *
 *   POST {baseUrl}/cims/import/returnOrders
 *   headers: { authUsername, authPassword, authDomainName }   (custom auth)
 *   body:    { omsLocationId, fulfillmentLocationCode, clientId, channelId,
 *              channelReturnOrderId, forms: [ { ...one return line... } ] }
 *
 * Config is slug-driven and per-org (DB override → env default). CIMS location/
 * client params + the Webget dedup config travel on the resolved config too.
 */

export interface UploadRowResult {
  orderId: string;
  status: RowStatus;
  error: string | null;
}

export interface CimsParams {
  omsLocationId: number;
  fulfillmentLocationCode: string;
  clientId: number;
  channelId: string;
  timeoutMs: number;
}

export interface ResolvedExternalConfig {
  client: string;
  baseUrl: string;
  returnOrdersPath: string;
  authHeaders: Record<string, string>;
  cims: CimsParams;
  webget: WebgetConfig;
}

const CONFIG_TTL_MS = 60_000;
const MAX_TRANSIENT_ATTEMPTS = 3; // only for network/timeout errors, never for HTTP 4xx/5xx
const BASE_BACKOFF_MS = 500;

const configCache = new Map<string, { value: ResolvedExternalConfig; expires: number }>();

// ── Slug-driven derivation (Increff client pattern) ──────────────────────────
export function hostFromClient(client: string): string {
  return env.EXTERNAL_API_HOST_TEMPLATE.replace('{client}', client).replace(/\/+$/, '');
}
export function domainFromClient(client: string): string {
  return env.EXTERNAL_API_DOMAIN_TEMPLATE.replace('{client}', client);
}

function parseWebgetAuthHeaders(): Record<string, string> | null {
  const raw = env.WEBGET_AUTH_HEADERS;
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, string>;
    return obj && typeof obj === 'object' && Object.keys(obj).length > 0 ? obj : null;
  } catch {
    logger.error('WEBGET_AUTH_HEADERS is not valid JSON — dedup disabled');
    return null;
  }
}

function deriveConfig(opts: {
  client: string;
  password: string;
  usernameOverride?: string | null;
  returnOrdersPath?: string;
}): ResolvedExternalConfig {
  const client = opts.client;
  const authUsername = opts.usernameOverride || env.EXTERNAL_API_USERNAME;
  return {
    client,
    baseUrl: hostFromClient(client),
    returnOrdersPath: opts.returnOrdersPath ?? env.EXTERNAL_API_RETURN_ORDERS_PATH,
    authHeaders: {
      authUsername,
      authPassword: opts.password,
      authDomainName: domainFromClient(client),
    },
    cims: {
      omsLocationId: env.CIMS_OMS_LOCATION_ID,
      fulfillmentLocationCode: env.CIMS_FULFILLMENT_LOCATION_CODE,
      clientId: env.CIMS_CLIENT_ID,
      channelId: env.CIMS_CHANNEL_ID,
      timeoutMs: env.CIMS_TIMEOUT_MS,
    },
    webget: {
      url: env.WEBGET_URL,
      schema: env.WEBGET_SCHEMA,
      dbId: env.WEBGET_DB_ID,
      table: env.WEBGET_TABLE,
      idColumn: env.WEBGET_ID_COLUMN,
      channelColumn: env.WEBGET_CHANNEL_COLUMN,
      channelId: env.CIMS_CHANNEL_ID,
      authHeaders: parseWebgetAuthHeaders(),
      timeoutMs: env.WEBGET_TIMEOUT_MS,
      batchSize: env.WEBGET_BATCH_SIZE,
    },
  };
}

/**
 * Resolve external config for an org.
 *
 *  1. A per-org row (slug + encrypted password) always takes precedence.
 *  2. Otherwise the EXTERNAL_API_* env defaults apply — but ONLY to the default
 *     tenant (the org whose slug === EXTERNAL_API_CLIENT, currently "adidasgcc").
 *     Those credentials are Adidas-specific, so any OTHER org without its own
 *     external_api_configs row is rejected rather than silently submitting its
 *     returns to Adidas's CIMS with Adidas credentials.
 *
 * Cached for CONFIG_TTL_MS.
 */
export async function resolveExternalConfig(orgId: string): Promise<ResolvedExternalConfig> {
  const cached = configCache.get(orgId);
  if (cached && cached.expires > Date.now()) return cached.value;

  const row = await prisma.externalApiConfig.findUnique({ where: { orgId } });
  let value: ResolvedExternalConfig;

  if (row) {
    value = deriveConfig({
      client: row.clientSlug,
      password: decryptSecret(row.authPasswordEnc),
      usernameOverride: row.authUsername,
      returnOrdersPath: row.returnOrdersPath,
    });
  } else {
    // No per-org config → only the default tenant (Adidas) may use the env creds.
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    });
    if (!org || org.slug !== env.EXTERNAL_API_CLIENT) {
      throw new AppError(
        ErrorCode.PROC_UPLOAD_FAILED,
        `CIMS integration is not configured for this organization. The default ` +
          `credentials are restricted to "${env.EXTERNAL_API_CLIENT}"; add a per-org ` +
          `config via PUT /admin/orgs/:id/external-api.`,
      );
    }
    value = deriveConfig({ client: env.EXTERNAL_API_CLIENT, password: env.EXTERNAL_API_PASSWORD });
  }

  configCache.set(orgId, { value, expires: Date.now() + CONFIG_TTL_MS });
  return value;
}

export function invalidateExternalConfig(orgId: string): void {
  configCache.delete(orgId);
}

// ── CIMS payload + submission (n8n parity) ───────────────────────────────────

function returnOrderType(row: ReturnRow): 'RETURN_TO_ORIGIN' | 'CUSTOMER_RETURN' {
  return row.type.toUpperCase().includes('RTO') ? 'RETURN_TO_ORIGIN' : 'CUSTOMER_RETURN';
}

function toForm(row: ReturnRow): Record<string, unknown> {
  return {
    channelOrderId: row.sellerOrderId,
    channelSubOrderId: null,
    channelReturnOrderId: row.channelReturnOrderId,
    channelSku: row.sellerSkuCode,
    returnOrderType: returnOrderType(row),
    transporter: null,
    trackingId: row.trackingId,
    reasonForReturn: row.returnReason,
    quantity: row.quantity,
  };
}

/**
 * Build one CIMS request for a group of rows that SHARE a channelReturnOrderId.
 * A return order can carry multiple line items, so all rows in the group become
 * entries in `forms[]` — mirroring the CIMS UI's CSV upload (and avoiding the
 * "Duplicate Channel Orders for Return-OrderId" error you get from sending the
 * same return order as separate requests).
 */
export function buildCimsGroupPayload(rows: ReturnRow[], cfg: ResolvedExternalConfig): unknown {
  return {
    omsLocationId: cfg.cims.omsLocationId,
    fulfillmentLocationCode: cfg.cims.fulfillmentLocationCode,
    clientId: cfg.cims.clientId,
    channelId: cfg.cims.channelId,
    channelReturnOrderId: rows[0]!.channelReturnOrderId,
    forms: rows.map(toForm),
  };
}

/** Single-row payload (a group of one — kept for tests / backward compatibility). */
export function buildCimsPayload(row: ReturnRow, cfg: ResolvedExternalConfig): unknown {
  return buildCimsGroupPayload([row], cfg);
}

interface CimsErrorBody {
  message?: string;
  description?: string;
  errors?: Array<{ field?: string; message?: string }>;
}

/** Classify a CIMS HTTP response into a row result ("Build Result"). */
export function classifyCimsResponse(
  statusCode: number,
  bodyText: string,
  orderId: string,
): UploadRowResult {
  const isSuccess = statusCode >= 200 && statusCode < 300;
  if (isSuccess) return { orderId, status: 'SUCCESS', error: null };

  let errorMessage = '';
  let parsed: CimsErrorBody | null = null;
  try {
    parsed = JSON.parse(bodyText) as CimsErrorBody;
  } catch {
    errorMessage = bodyText;
  }

  if (parsed && typeof parsed === 'object') {
    const parts: string[] = [];
    if (parsed.message) parts.push(parsed.message);
    if (parsed.description) parts.push(parsed.description);
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      const fieldErrors = parsed.errors
        .map((e) => `${e.field || 'unknown'}: ${e.message || 'invalid'}`)
        .join('; ');
      parts.push(`[${fieldErrors}]`);
    }
    errorMessage = parts.join(' | ') || `HTTP ${statusCode}`;
  }
  if (!errorMessage) errorMessage = `HTTP ${statusCode}`;

  return { orderId, status: 'FAILED', error: errorMessage };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const backoff = (attempt: number) => BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 100;

/**
 * Submit a single return order. Retries ONLY on network/timeout errors (where we
 * can't be sure CIMS received it AND it would not have created the order). An
 * HTTP 4xx/5xx is recorded as a FAILED result without retry — matching the n8n
 * `neverError` behavior and avoiding duplicate creation.
 */
/**
 * Submit ONE return order (a group of line items sharing channelReturnOrderId).
 * Retries ONLY on network/timeout errors (where we can't be sure CIMS received
 * it). An HTTP 4xx/5xx is recorded as FAILED without retry (n8n `neverError`
 * parity, avoids duplicate creation). Returns one result per row in the group,
 * all carrying the group's outcome.
 */
async function submitReturnOrderGroup(
  rows: ReturnRow[],
  cfg: ResolvedExternalConfig,
): Promise<UploadRowResult[]> {
  const url = `${cfg.baseUrl}${cfg.returnOrdersPath}`;
  const body = JSON.stringify(buildCimsGroupPayload(rows, cfg));
  const returnId = rows[0]!.channelReturnOrderId;
  const fanOut = (status: UploadRowResult['status'], error: string | null) =>
    rows.map((r) => ({ orderId: r.sellerOrderId, status, error }));

  let lastErr = 'network error';
  for (let attempt = 1; attempt <= MAX_TRANSIENT_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.cims.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', ...cfg.authHeaders },
        body,
      });
      const text = await res.text();
      const verdict = classifyCimsResponse(res.status, text, returnId);
      return fanOut(verdict.status, verdict.error);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_TRANSIENT_ATTEMPTS) {
        logger.warn({ attempt, channelReturnOrderId: returnId, err: lastErr }, 'CIMS submit retry');
        await sleep(backoff(attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return fanOut('FAILED', lastErr);
}

/** Max return orders submitted to CIMS at once (bounded concurrency). */
const SUBMIT_CONCURRENCY = Math.max(1, Number(env.CIMS_SUBMIT_CONCURRENCY) || 5);

/** Group rows that belong to the same return order (shared channelReturnOrderId). */
function groupByReturnOrder(rows: ReturnRow[]): ReturnRow[][] {
  const groups = new Map<string, ReturnRow[]>();
  for (const row of rows) {
    const key = row.channelReturnOrderId || `__norid__${row.sellerOrderId}`;
    const g = groups.get(key);
    if (g) g.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()];
}

/**
 * Submit return orders to CIMS. Rows are grouped by channelReturnOrderId so a
 * multi-item return is ONE request with multiple forms (CIMS UI parity); groups
 * are submitted with bounded concurrency. Never throws; returns one result per
 * input row (keyed by channelOrderId / sellerOrderId).
 */
export async function uploadReturnOrders(
  rows: ReturnRow[],
  cfg: ResolvedExternalConfig,
): Promise<UploadRowResult[]> {
  const groups = groupByReturnOrder(rows);
  const groupResults: UploadRowResult[][] = new Array(groups.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= groups.length) return;
      groupResults[i] = await submitReturnOrderGroup(groups[i]!, cfg);
    }
  }

  const lanes = Math.min(SUBMIT_CONCURRENCY, groups.length);
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return groupResults.flat();
}

// ── Transitional n8n passthrough (kept; disabled unless N8N_WEBHOOK_URL set) ──
export async function uploadViaN8n(
  fileBuffer: Buffer,
  filename: string,
  marketplace: string,
): Promise<UploadRowResult[]> {
  if (!env.N8N_WEBHOOK_URL) throw new Error('N8N_WEBHOOK_URL not configured');

  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  const contentType =
    ext === '.csv'
      ? 'text/csv'
      : ext === '.xls'
        ? 'application/vnd.ms-excel'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: contentType }), filename);
  form.append('marketplace', marketplace);
  form.append('source', 'rg-backend');
  form.append('downloaded_at', new Date().toISOString());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_800_000);
  try {
    const res = await fetch(env.N8N_WEBHOOK_URL, { method: 'POST', body: form, signal: controller.signal });
    const csvText = await res.text();
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`n8n returned HTTP ${res.status}: ${csvText.slice(0, 200)}`);
    }
    return parseN8nResultsCsv(csvText);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeStatus(token: unknown): RowStatus {
  const s = String(token ?? '').trim().toUpperCase();
  if (['SUCCESS', 'OK', 'CREATED', 'ACCEPTED'].includes(s)) return 'SUCCESS';
  if (['SKIPPED', 'DUPLICATE', 'EXISTS'].includes(s)) return 'SKIPPED';
  return 'FAILED';
}

export function parseN8nResultsCsv(csvText: string): UploadRowResult[] {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = (lines[0] ?? '').toLowerCase();
  const hasHeader = /\border_?id\b/.test(header) && /\bstatus\b/.test(header);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines.map((line) => {
    const parts = line.split(',');
    const orderId = (parts[0] ?? '').replace(/^"|"$/g, '').trim();
    const status = normalizeStatus((parts[1] ?? '').replace(/^"|"$/g, ''));
    const error = parts.slice(2).join(',').replace(/^"|"$/g, '').trim() || null;
    return { orderId, status, error };
  });
}
