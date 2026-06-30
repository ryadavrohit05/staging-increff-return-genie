import 'dotenv/config';
import { z } from 'zod';

/**
 * Zod-validated environment loader. Fails fast at boot if any required variable
 * is missing or malformed. The external-API and Supabase service-role secrets
 * live ONLY here — they are never returned to clients and are redacted in logs.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Database (Supabase Postgres)
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(16),

  // External upload API (Increff CIMS) — creds live ONLY in the backend.
  //
  // Config is slug-driven. The Increff convention is:
  //   host   = https://{client}.omni.increff.com   (EXTERNAL_API_HOST_TEMPLATE)
  //   domain = {client}-oltp                        (EXTERNAL_API_DOMAIN_TEMPLATE)
  //   user   = shared constant (EXTERNAL_API_USERNAME)
  //   pass   = per-client secret (EXTERNAL_API_PASSWORD here; per-org override in DB)
  //
  // EXTERNAL_API_CLIENT is the DEFAULT/active tenant slug (currently `adidasgcc`).
  // Per-tenant overrides live (encrypted) in external_api_configs and resolve first.
  EXTERNAL_API_CLIENT: z.string().min(1), // e.g. adidasgcc
  EXTERNAL_API_HOST_TEMPLATE: z.string().default('https://{client}.omni.increff.com'),
  EXTERNAL_API_DOMAIN_TEMPLATE: z.string().default('{client}-oltp'),
  EXTERNAL_API_RETURN_ORDERS_PATH: z.string().default('/cims/import/returnOrders'),
  EXTERNAL_API_USERNAME: z.string().min(1), // shared across clients
  EXTERNAL_API_PASSWORD: z.string().min(1), // default tenant password

  // Key used to encrypt per-org external-API passwords at rest (lib/crypto.ts).
  // Use a random 32-byte base64 value in production.
  EXTERNAL_API_ENC_KEY: z.string().min(16),

  // CIMS import payload params (per the proven n8n "Format JSON Payload").
  // Currently the Adidas tenant's values; per-org overrides are a future addition.
  CIMS_OMS_LOCATION_ID: z.coerce.number().int(),
  CIMS_FULFILLMENT_LOCATION_CODE: z.string().min(1),
  CIMS_CLIENT_ID: z.coerce.number().int(),
  CIMS_CHANNEL_ID: z.string().default('MYNTRAV4'),
  CIMS_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  // How many return orders to submit to CIMS concurrently (bounded fan-out).
  CIMS_SUBMIT_CONCURRENCY: z.coerce.number().int().positive().default(5),

  // Webget dedup (query CIMS for orders that already exist before submitting).
  WEBGET_URL: z.string().url().default('https://saas.increff.com/webget/in/api/app/sql/result'),
  WEBGET_SCHEMA: z.string().default('cims'),
  WEBGET_DB_ID: z.coerce.number().int(),
  WEBGET_TABLE: z.string().default('cims_return_order_pojo'),
  WEBGET_ID_COLUMN: z.string().default('channel_order_id'),
  WEBGET_CHANNEL_COLUMN: z.string().default('channel_id'),
  WEBGET_BATCH_SIZE: z.coerce.number().int().positive().default(3000),
  WEBGET_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  // Custom-auth headers for the Webget API, as a JSON object string.
  // e.g. {"authUsername":"...","authPassword":"...","authDomainName":"..."}
  // Empty/unset ⇒ dedup is skipped (all rows submitted).
  WEBGET_AUTH_HEADERS: z
    .string()
    .optional()
    .or(z.literal('').transform(() => undefined)),

  // n8n (optional, transitional). Empty string => disabled.
  N8N_WEBHOOK_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),

  // CORS allowlist (comma-separated).
  CORS_ORIGINS: z.string().default(''),

  // Licensing / versioning
  OFFLINE_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(259200),
  MIN_SUPPORTED_VERSION: z.string().default('0.1.0'),

  // Storage buckets
  STORAGE_BUCKET_REPORTS: z.string().default('reports'),
  STORAGE_BUCKET_RESULTS: z.string().default('results'),
  STORAGE_BUCKET_SCREENSHOTS: z.string().default('screenshots'),
  // Private bucket holding the desktop installer binaries (gated download).
  STORAGE_BUCKET_RELEASES: z.string().default('releases'),
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

export const corsOrigins: string[] = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export type Env = typeof env;
