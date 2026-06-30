// One-off helper: set a known password for a tenant user so they can sign in to
// the desktop app (the admin "New client" flow generates an unrecoverable temp
// password). Run with the service-role key from .env:
//
//   cd "D:\Return Genie\apps\backend"
//   node --env-file=.env set-owner-password.mjs neha.sidana@adidas.com "YourChosenPassword"
//
// Delete this file when done.
import { createClient } from '@supabase/supabase-js';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node --env-file=.env set-owner-password.mjs <email> <password>');
  process.exit(1);
}
if (password.length < 8) {
  // The app's LoginInput contract (@rg/shared) requires password.min(8), so a
  // shorter password would be rejected at login with "Invalid request payload".
  console.error('Password must be at least 8 characters (app login requires min 8).');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let target = null;
for (let page = 1; page <= 10 && !target; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  target = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (data.users.length < 200) break;
}
if (!target) {
  console.error(`No auth user found for ${email}`);
  process.exit(1);
}

const { error } = await supabase.auth.admin.updateUserById(target.id, { password });
if (error) {
  console.error('Failed to set password:', error.message);
  process.exit(1);
}
console.log(
  `✅ Password set for ${email} (role=${target.app_metadata?.role}, org_id=${target.app_metadata?.org_id ?? 'none'})`,
);
