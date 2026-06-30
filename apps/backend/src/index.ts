import { pathToFileURL } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { ErrorCode } from '@rg/shared';
import { env, corsOrigins } from './env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/error.js';
import { registerWorkers } from './jobs/index.js';
import { stopBoss } from './services/queue.js';
import { prisma } from './lib/prisma.js';

import { authRouter } from './modules/auth/auth.routes.js';
import { devicesRouter } from './modules/devices/devices.routes.js';
import { licensesRouter } from './modules/licenses/licenses.routes.js';
import { syncRouter } from './modules/sync/sync.routes.js';
import { versionsRouter } from './modules/versions/versions.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { appRouter } from './modules/app/app.routes.js';

export function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Railway/Render proxy

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow non-browser clients (no Origin header), allowlisted origins, and
        // — in non-production only — any localhost port. Vite picks the next free
        // port (5173 → 5174 → 5175 …) when one is taken, so pinning a single dev
        // port causes spurious CORS failures; this keeps local dev frictionless
        // while production still enforces the explicit CORS_ORIGINS allowlist.
        const devLocalhost =
          env.NODE_ENV !== 'production' &&
          !!origin &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin) || devLocalhost) {
          cb(null, true);
          return;
        }
        cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  // Global rate limit.
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: { code: ErrorCode.RATE_LIMITED, message: 'Too many requests' },
        });
      },
    }),
  );

  // Liveness (unauthenticated).
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // API v1.
  const v1 = express.Router();
  v1.use('/auth', authRouter);
  v1.use('/devices', devicesRouter);
  v1.use('/license', licensesRouter);
  v1.use('/sync', syncRouter);
  v1.use('/versions', versionsRouter);
  v1.use('/app', appRouter);
  v1.use('/admin', adminRouter);
  app.use('/api/v1', v1);

  // 404 + error handler (must be last).
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

async function main() {
  const app = buildApp();

  // Start the job queue + workers before accepting traffic.
  await registerWorkers();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'rg-backend listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await stopBoss().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Only auto-start when run as the entry point (not when imported by tests).
const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  main().catch((err) => {
    logger.error({ err }, 'fatal boot error');
    process.exit(1);
  });
}
