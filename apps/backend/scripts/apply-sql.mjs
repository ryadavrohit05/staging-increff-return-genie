/**
 * Apply a .sql file statement-by-statement against the Supabase DB (DIRECT_URL).
 * Tolerant + idempotent: "already exists" / "permission denied" (e.g. storage
 * policies that must be applied as a privileged role) are skipped with a warning
 * rather than aborting. Public-schema RLS should apply with zero skips.
 *
 *   node scripts/apply-sql.mjs supabase/policies/rls.sql
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/apply-sql.mjs <file.sql>');
  process.exit(1);
}

const raw = readFileSync(file, 'utf8');
const cleaned = raw
  .split(/\r?\n/)
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
const statements = cleaned
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
let applied = 0;
const skipped = [];

for (const stmt of statements) {
  try {
    await prisma.$executeRawUnsafe(stmt);
    applied++;
  } catch (e) {
    const msg = String(e?.message || e);
    if (/already exists|duplicate|must be owner|permission denied/i.test(msg)) {
      skipped.push(`${stmt.slice(0, 70).replace(/\s+/g, ' ')}… → ${msg.split('\n')[0]}`);
      continue;
    }
    console.error('FAILED:\n' + stmt.slice(0, 200) + '\n' + msg);
    await prisma.$disconnect();
    process.exit(1);
  }
}

console.log(`${file}: applied ${applied}, skipped ${skipped.length}`);
for (const s of skipped) console.log('  skip:', s);
await prisma.$disconnect();
