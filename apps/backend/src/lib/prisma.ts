import { PrismaClient } from '@prisma/client';
import { env } from '../env.js';

/**
 * Prisma client singleton. In dev (tsx watch) a global cache prevents exhausting
 * the connection pool on reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
