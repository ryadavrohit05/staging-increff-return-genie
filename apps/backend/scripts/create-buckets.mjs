/**
 * Create the three private Storage buckets via the Supabase service-role key.
 * Idempotent — existing buckets are left as-is.
 *
 *   node scripts/create-buckets.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKETS = [
  process.env.STORAGE_BUCKET_REPORTS || 'reports',
  process.env.STORAGE_BUCKET_RESULTS || 'results',
  process.env.STORAGE_BUCKET_SCREENSHOTS || 'screenshots',
  process.env.STORAGE_BUCKET_RELEASES || 'releases',
];

for (const id of BUCKETS) {
  const { error } = await sb.storage.createBucket(id, { public: false });
  if (error && !/exist/i.test(error.message)) {
    console.error('bucket', id, 'FAILED:', error.message);
    process.exit(1);
  }
  console.log('bucket', id, error ? '(already exists)' : 'created');
}

const { data } = await sb.storage.listBuckets();
console.log('buckets now:', (data || []).map((b) => `${b.name}${b.public ? ' (public!)' : ''}`).join(', '));
