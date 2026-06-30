# Setup Guide

First-time setup for local development (and the basis for production in
[`DEPLOYMENT.md`](./DEPLOYMENT.md)). Every environment variable referenced here is
catalogued in [`ENVIRONMENT.md`](./ENVIRONMENT.md).

## 0. Prerequisites
- Node 20 (`>=20 <23`)
- pnpm 9 — `npm i -g pnpm@9`
- A Supabase account (free tier is enough to start)

```bash
pnpm install
pnpm db:generate
```

---

## 1. Create the Supabase project

1. **Create a project** at <https://supabase.com> (note the project ref, region,
   and database password).
2. **Auth → Providers → Email**: enable **Email** sign-in. For internal admin/
   owner accounts you typically **disable public sign-ups** (Auth → Settings →
   "Allow new users to sign up" = off) — users are provisioned by the backend.
3. **Project Settings → API**: copy
   - `Project URL` → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**secret — backend only**)
   - `JWT Secret` → `SUPABASE_JWT_SECRET`
4. **Project Settings → Database → Connection string**: copy both
   - **Pooled** (PgBouncer, port `6543`) → `DATABASE_URL` (append `?pgbouncer=true`)
   - **Direct** (port `5432`) → `DIRECT_URL` (used by Prisma Migrate + pg-boss DDL)

## 2. Backend environment

```bash
cp apps/backend/.env.example apps/backend/.env
```
Fill in `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, and the `EXTERNAL_API_*`
credentials (Increff CIMS). Leave `N8N_WEBHOOK_URL` empty to call the external
API directly. See [`ENVIRONMENT.md`](./ENVIRONMENT.md) for every key.

## 3. Run database migrations (Prisma)

Prisma Migrate uses `DIRECT_URL`.
```bash
pnpm db:migrate           # dev: creates/applies migrations against your Supabase DB
# (production uses: pnpm --filter @rg/backend prisma:deploy)
```

## 4. Apply RLS policies

After the tables exist, apply the row-level-security SQL so direct client access
(e.g. desktop Realtime subscriptions) is tenant-scoped. The backend uses the
service-role key and bypasses RLS, but the policies protect everything else.

In the Supabase **SQL Editor**, paste and run the contents of:
```
apps/backend/supabase/policies/rls.sql
```
(or via the CLI: `psql "$DIRECT_URL" -f apps/backend/supabase/policies/rls.sql`).

## 5. Create the 3 Storage buckets

**Storage → New bucket** (all **private**), matching the backend env names:
- `reports` — raw downloaded marketplace reports
- `results` — processed results CSVs
- `screenshots` — automation failure screenshots

Objects are pathed `<org_id>/<sync_run_id>/...` and accessed via backend-minted
signed URLs (the admin portal's sync-run detail uses these for screenshots).

## 6. Create the first SUPERADMIN user

The admin portal is SUPERADMIN-only. There is no public sign-up for it, and the
`role`/`org_id` must live in the user's **`app_metadata`** (RLS + backend read it
from the JWT). Create the user via the Supabase service role.

**Option A — Supabase dashboard:** Auth → Users → Add user (set email + password,
confirm the email). Then set metadata via the Management API or SQL/RPC. The most
reliable way is the admin API (Option B), because dashboard metadata editing is
limited.

**Option B — service-role script (recommended):** run a one-off Node snippet with
the service-role key:
```ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
await supabase.auth.admin.createUser({
  email: 'omni.delivery@increff.com',
  password: 'a-strong-temporary-password',
  email_confirm: true,
  app_metadata: { role: 'SUPERADMIN' }, // SUPERADMIN is platform-level → no org_id needed
});
```
> SUPERADMIN is cross-tenant, so it has **no** `org_id`. OWNER/ADMIN/MEMBER users
> are provisioned automatically by the backend with both `role` and `org_id`
> (e.g. when you create a client org — see step 9).

## 7. Admin portal environment

```bash
cp apps/admin/.env.example apps/admin/.env.local
```
Set `VITE_BACKEND_URL=http://localhost:4000`, `VITE_SUPABASE_URL`, and
`VITE_SUPABASE_ANON_KEY`. (Only the anon key — never the service role — belongs in
the browser.)

## 8. Desktop environment

```bash
cp apps/desktop/.env.example apps/desktop/.env   # if the file exists in the desktop app
```
The desktop app needs the backend URL and Supabase URL/anon key. Marketplace
credentials are **never** put in env — they go into the OS keystore at runtime
(DPAPI / Credential Manager).

## 9. Run everything + create your first client org

```bash
pnpm backend:dev    # http://localhost:4000
pnpm admin:dev      # http://localhost:5174
pnpm desktop:dev
```

In the **admin portal**:
1. Sign in at `/login` with the SUPERADMIN you created.
2. **Clients → New client**: enter org name, slug, owner email, plan, max devices,
   and license expiry. This calls `POST /api/v1/admin/orgs`, which:
   - creates the Organization + License (Prisma transaction),
   - provisions the OWNER in Supabase Auth with `app_metadata = { org_id, role: 'OWNER' }`
     and a **temporary password**,
   - mirrors the user into the `users` table.
3. Share the owner email + temporary password with the client; they sign in from
   the **desktop app**, which registers their device (subject to the license
   `maxDevices` cap) and lets them save Myntra credentials locally.

You now have a working multi-tenant setup. Continue to
[`DEPLOYMENT.md`](./DEPLOYMENT.md) for production.
