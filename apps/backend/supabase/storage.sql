-- ─────────────────────────────────────────────────────────────────────────────
-- Return Genie — Supabase Storage buckets + org-scoped policies
--
-- Three private buckets (ARCHITECTURE.md §13), all pathed by
-- `<org_id>/<sync_run_id>/...`:
--   reports/      raw downloaded marketplace reports (CSV/XLSX)
--   results/      per-row results CSV produced by the processing pipeline
--   screenshots/  failure screenshots (PNG) from the automation engine
--
-- Access pattern: the backend mints short-lived SIGNED URLs with the service-role
-- key (services/storage.ts). Clients never get bucket-wide credentials. The
-- policies below are a defence-in-depth layer for any direct authenticated reads:
-- a user may only read objects whose first path segment equals their JWT org_id.
-- The service role bypasses these policies for trusted uploads.
-- ─────────────────────────────────────────────────────────────────────────────

-- Create the buckets as PRIVATE (public = false). Idempotent.
insert into storage.buckets (id, name, public)
values
  ('reports',     'reports',     false),
  ('results',     'results',     false),
  ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

-- Helper: the JWT org claim.
--   (auth.jwt() -> 'app_metadata' ->> 'org_id')
-- The object's owning org is the first segment of its path:
--   (storage.foldername(name))[1]

-- ── reports ──────────────────────────────────────────────────────────────────
create policy reports_org_read on storage.objects for select
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'org_id')
  );

create policy reports_superadmin on storage.objects for all
  using (
    bucket_id = 'reports'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN'
  );

-- ── results ──────────────────────────────────────────────────────────────────
create policy results_org_read on storage.objects for select
  using (
    bucket_id = 'results'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'org_id')
  );

create policy results_superadmin on storage.objects for all
  using (
    bucket_id = 'results'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN'
  );

-- ── screenshots ──────────────────────────────────────────────────────────────
create policy screenshots_org_read on storage.objects for select
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'org_id')
  );

create policy screenshots_superadmin on storage.objects for all
  using (
    bucket_id = 'screenshots'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN'
  );
