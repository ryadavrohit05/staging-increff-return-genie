/**
 * Seed (or update) a client organization: org + active license + OWNER user.
 * Mirrors the admin POST /orgs logic but runs directly against Supabase/Postgres.
 * Idempotent: reuses an existing org/license/user by slug/email.
 *
 *   node scripts/seed-org.mjs "<name>" <slug> <ownerEmail> <ownerPassword> [plan] [maxDevices] [licenseDays]
 *
 * The CIMS integration for this org resolves from the slug-driven env default
 * (EXTERNAL_API_CLIENT) unless a per-org external_api_configs row is set.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const [name, slug, ownerEmail, ownerPassword, plan = 'standard', maxDevicesArg = '2', daysArg = '365'] =
  process.argv.slice(2);

if (!name || !slug || !ownerEmail || !ownerPassword) {
  console.error('usage: node scripts/seed-org.mjs "<name>" <slug> <ownerEmail> <ownerPassword> [plan] [maxDevices] [licenseDays]');
  process.exit(1);
}
const maxDevices = parseInt(maxDevicesArg, 10) || 2;
const days = parseInt(daysArg, 10) || 365;

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1) organization
  let org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) {
    org = await prisma.organization.create({ data: { name, slug, status: 'ACTIVE', maxDevices } });
    console.log('org created     :', org.id, `(${slug})`);
  } else {
    org = await prisma.organization.update({ where: { id: org.id }, data: { name, status: 'ACTIVE', maxDevices } });
    console.log('org exists      :', org.id, `(${slug})`);
  }

  // 2) license (ensure one ACTIVE, valid for `days`)
  const validUntil = new Date(Date.now() + days * 86_400_000);
  let lic = await prisma.license.findFirst({ where: { orgId: org.id }, orderBy: { validUntil: 'desc' } });
  if (!lic) {
    lic = await prisma.license.create({ data: { orgId: org.id, plan, status: 'ACTIVE', maxDevices, validUntil } });
    console.log('license created :', lic.id, '→', validUntil.toISOString().slice(0, 10));
  } else {
    lic = await prisma.license.update({ where: { id: lic.id }, data: { status: 'ACTIVE', plan, maxDevices, validUntil } });
    console.log('license updated :', lic.id, '→', validUntil.toISOString().slice(0, 10));
  }

  // 3) OWNER user in Supabase Auth (app_metadata carries org_id + role)
  let userId;
  const created = await sb.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    app_metadata: { org_id: org.id, role: 'OWNER' },
  });
  if (!created.error && created.data.user) {
    userId = created.data.user.id;
    console.log('owner created   :', userId, ownerEmail);
  } else {
    const list = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const u = list.data.users.find((x) => x.email?.toLowerCase() === ownerEmail.toLowerCase());
    if (!u) throw new Error(`create failed and user not found: ${created.error?.message}`);
    const upd = await sb.auth.admin.updateUserById(u.id, {
      password: ownerPassword,
      email_confirm: true,
      app_metadata: { ...u.app_metadata, org_id: org.id, role: 'OWNER' },
    });
    if (upd.error) throw upd.error;
    userId = u.id;
    console.log('owner updated   :', userId, ownerEmail);
  }

  // 4) mirror into our users table
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, orgId: org.id, email: ownerEmail, role: 'OWNER' },
    update: { orgId: org.id, email: ownerEmail, role: 'OWNER' },
  });

  console.log('\nDONE. Desktop login:', ownerEmail, '/', '<the password you set>');
  console.log('CIMS client (env default):', process.env.EXTERNAL_API_CLIENT);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('seed-org failed:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
