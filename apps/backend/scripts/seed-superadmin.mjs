/**
 * Seed (or update) a platform SUPERADMIN in Supabase Auth.
 * SUPERADMIN is cross-tenant: it carries `app_metadata.role=SUPERADMIN` and no
 * org_id, and needs no row in the `users` table (auth reads the JWT claim).
 *
 *   node scripts/seed-superadmin.mjs <email> <password>
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error('usage: node scripts/seed-superadmin.mjs <email> <password>');
  process.exit(1);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const created = await sb.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: 'SUPERADMIN' },
});

if (!created.error && created.data.user) {
  console.log('Created SUPERADMIN:', created.data.user.id, email);
} else {
  // Likely already registered → find and update password + role.
  const list = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error('Create failed and user not found:', created.error?.message);
    process.exit(1);
  }
  const upd = await sb.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    app_metadata: { ...user.app_metadata, role: 'SUPERADMIN' },
  });
  if (upd.error) {
    console.error('Update failed:', upd.error.message);
    process.exit(1);
  }
  console.log('Updated existing user → SUPERADMIN:', user.id, email);
}
