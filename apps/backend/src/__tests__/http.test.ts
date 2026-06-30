import { describe, it, expect, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { buildApp } from '../index.js';

/**
 * In-process HTTP smoke test of the real Express stack (helmet, cors, rate-limit,
 * routing, 404, error handler). Boots the app on an ephemeral port — no database
 * and no job queue required, so it proves the server wiring independently of
 * Supabase being configured.
 */
const app = buildApp();
let server: Server;
const base = await new Promise<string>((resolve) => {
  server = app.listen(0, () => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    resolve(`http://127.0.0.1:${port}`);
  });
});

afterAll(() => {
  server.close();
});

describe('HTTP server', () => {
  it('serves the liveness endpoint', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await fetch(`${base}/api/v1/does-not-exist`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBeDefined();
  });

  it('rejects unauthenticated access to a protected route', async () => {
    // /license/status requires a Bearer token — without one we expect 401,
    // exercising the auth middleware before any DB access.
    const res = await fetch(`${base}/api/v1/license/status`);
    expect(res.status).toBe(401);
  });

  it('sets security headers (helmet)', async () => {
    const res = await fetch(`${base}/health`);
    // helmet sets these by default
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});
