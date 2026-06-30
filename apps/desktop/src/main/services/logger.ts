/**
 * Minimal structured logger for the main process.
 *
 * Hard rule (ARCHITECTURE.md §5): credentials/tokens are NEVER logged. This
 * logger has a redaction allowlist applied to any object payload before it is
 * serialized — `password`, `email`, `accessToken`, `refreshToken` keys are masked.
 */
const REDACT_KEYS = new Set([
  'password',
  'email',
  'accessToken',
  'refreshToken',
  'token',
  'authorization',
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k) ? '***' : redact(v);
    }
    return out;
  }
  return value;
}

function emit(level: string, scope: string, message: string, meta?: unknown): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta !== undefined ? { meta: redact(meta) } : {}),
  };
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    JSON.stringify(line),
  );
}

export function createLog(scope: string) {
  return {
    info: (message: string, meta?: unknown) => emit('info', scope, message, meta),
    warn: (message: string, meta?: unknown) => emit('warn', scope, message, meta),
    error: (message: string, meta?: unknown) => emit('error', scope, message, meta),
  };
}

export type Log = ReturnType<typeof createLog>;
