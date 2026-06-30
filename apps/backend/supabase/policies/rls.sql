-- ─────────────────────────────────────────────────────────────────────────────
-- Return Genie — Row-Level Security policies (Supabase Postgres)
--
-- Multi-tenant isolation enforced at the DB layer so an API bug cannot leak data
-- across tenants (ARCHITECTURE.md §3, §7). The JWT carries `org_id` and `role` in
-- `app_metadata`; policies read them via `auth.jwt()`.
--
-- NOTE on the backend's role: the backend connects with the Supabase SERVICE ROLE
-- key for trusted writes. The service role BYPASSES RLS entirely (it is not subject
-- to these policies), so all backend writes happen only AFTER the tenant checks in
-- middleware/tenant.ts + middleware/license.ts. These policies exist to protect
-- direct client access (e.g. the desktop subscribing to Realtime with the user's
-- anon JWT) — Realtime honours RLS too.
--
-- Apply order: run AFTER `prisma migrate deploy` has created the tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper expressions used throughout:
--   org claim : (auth.jwt() -> 'app_metadata' ->> 'org_id')
--   role claim: (auth.jwt() -> 'app_metadata' ->> 'role')

-- ── organizations ───────────────────────────────────────────────────────────
alter table organizations enable row level security;

create policy organizations_select on organizations for select
  using (id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

create policy organizations_superadmin on organizations for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');

-- ── users ────────────────────────────────────────────────────────────────────
alter table users enable row level security;

create policy users_select on users for select
  using (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

create policy users_insert on users for insert
  with check (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

create policy users_superadmin on users for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');

-- ── devices ──────────────────────────────────────────────────────────────────
alter table devices enable row level security;

create policy devices_select on devices for select
  using (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

create policy devices_insert on devices for insert
  with check (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

create policy devices_superadmin on devices for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');

-- ── licenses ─────────────────────────────────────────────────────────────────
alter table licenses enable row level security;

create policy licenses_select on licenses for select
  using (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

create policy licenses_superadmin on licenses for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');

-- ── marketplace_accounts ─────────────────────────────────────────────────────
alter table marketplace_accounts enable row level security;

create policy marketplace_accounts_select on marketplace_accounts for select
  using (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

create policy marketplace_accounts_insert on marketplace_accounts for insert
  with check (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

create policy marketplace_accounts_superadmin on marketplace_accounts for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');

-- ── sync_runs ────────────────────────────────────────────────────────────────
alter table sync_runs enable row level security;

create policy sync_runs_select on sync_runs for select
  using (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

create policy sync_runs_insert on sync_runs for insert
  with check (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

create policy sync_runs_superadmin on sync_runs for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');

-- ── sync_logs ────────────────────────────────────────────────────────────────
-- No org_id column; scope via the parent run's org_id.
alter table sync_logs enable row level security;

create policy sync_logs_select on sync_logs for select
  using (
    exists (
      select 1 from sync_runs r
      where r.id = sync_logs.sync_run_id
        and r.org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')
    )
  );

create policy sync_logs_superadmin on sync_logs for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');

-- ── sync_results ─────────────────────────────────────────────────────────────
alter table sync_results enable row level security;

create policy sync_results_select on sync_results for select
  using (
    exists (
      select 1 from sync_runs r
      where r.id = sync_results.sync_run_id
        and r.org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')
    )
  );

create policy sync_results_superadmin on sync_results for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');

-- ── app_versions ─────────────────────────────────────────────────────────────
-- Not tenant-scoped: any authenticated client may read the version feed; only
-- SUPERADMIN may write.
alter table app_versions enable row level security;

create policy app_versions_select on app_versions for select
  using (auth.role() = 'authenticated');

create policy app_versions_superadmin on app_versions for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');

-- ── audit_logs ───────────────────────────────────────────────────────────────
-- Only SUPERADMIN reads audit; writes are backend-only (service role).
alter table audit_logs enable row level security;

create policy audit_logs_superadmin on audit_logs for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');

-- ── external_api_configs ─────────────────────────────────────────────────────
-- Holds per-org CIMS config incl. the ENCRYPTED upload-API password. Accessed
-- ONLY by the backend (service role, which bypasses RLS). Enable RLS with a
-- SUPERADMIN-only policy so the row (and ciphertext) is never exposed to client
-- roles via PostgREST or Realtime.
alter table external_api_configs enable row level security;

create policy external_api_configs_superadmin on external_api_configs for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');
