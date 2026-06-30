import { pino } from 'pino';
import { env } from '../env.js';

/**
 * Pino logger with strict redaction. Authorization headers, cookies, and any
 * password/secret/token fields are masked at the serializer so credentials
 * (Supabase service role, external-API password, user passwords) can never
 * appear in logs (ARCHITECTURE.md §5, §11).
 */
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'password',
  '*.password',
  'body.password',
  'config.auth',
  'externalApi',
  'EXTERNAL_API_PASSWORD',
  'EXTERNAL_API_USERNAME',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'SUPABASE_ANON_KEY',
  'accessToken',
  'refreshToken',
  '*.accessToken',
  '*.refreshToken',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  base: { service: 'rg-backend' },
});

export type Logger = typeof logger;
