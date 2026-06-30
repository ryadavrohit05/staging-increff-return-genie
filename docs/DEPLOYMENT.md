# Deployment Guide

Production deployment of the four deployables, plus the desktop release / auto-
update process. Assumes [`SETUP.md`](./SETUP.md) is understood. Every variable is
in [`ENVIRONMENT.md`](./ENVIRONMENT.md).

```
GitHub (monorepo)
 ├─ push main → CI (ci.yml)
 ├─ push main (apps/backend/**) → deploy-backend.yml → migrate + Render/Railway
 ├─ push main (apps/admin/**)   → deploy-admin.yml   → Vercel
 └─ push tag v* → release-desktop.yml → electron-builder → GitHub Releases
                                                              │
                                              electron-updater feed (clients)
```

---

## 1. Supabase (free → Pro)

- One project hosts Auth + Postgres + Storage + Realtime for all tenants; RLS
  provides multi-tenant isolation (`apps/backend/supabase/policies/rls.sql`).
- Start on **free**; the upgrade to **Pro** is a billing change, not a re-architecture
  (more DB storage/connections, larger Storage, no project pausing).
- Production checklist: run `prisma migrate deploy` (done by CI), apply the RLS
  SQL once, create the 3 private buckets (`reports`, `results`, `screenshots`),
  create the first SUPERADMIN (see `SETUP.md` §6), disable public sign-ups.

## 2. Backend API — Render (default) or Railway

The backend holds the **external upload API credentials** (Increff CIMS) and the
Supabase **service-role** key. These live only as host secrets, never in the repo
or client.

### Render (default)
1. New **Web Service** from the repo. Root build runs in the monorepo:
   - Build command: `pnpm install --frozen-lockfile && pnpm --filter @rg/shared build && pnpm --filter @rg/backend build && pnpm --filter @rg/backend prisma:generate`
   - Start command: `pnpm --filter @rg/backend start`
2. Set environment variables (see table below).
3. Copy the service's **Deploy Hook** URL into the GitHub secret
   `RENDER_DEPLOY_HOOK_URL`. `deploy-backend.yml` runs `prisma migrate deploy`
   then `curl`s this hook on every push to `apps/backend/**` (or manual dispatch).

### Railway (alternative)
Uncomment the Railway block in `deploy-backend.yml`, add a project token as
`RAILWAY_TOKEN`, and remove the Render step. CLI deploy: `railway up --service backend`.

### Backend production env vars
| Var | Secret | Notes |
| --- | --- | --- |
| `PORT` | no | Host usually injects this |
| `CORS_ORIGINS` | no | Include the Vercel admin URL + desktop origin |
| `DATABASE_URL` | yes | Pooled (6543, `?pgbouncer=true`) |
| `DIRECT_URL` | yes | Direct (5432) — migrations + pg-boss |
| `SUPABASE_URL` | no | |
| `SUPABASE_ANON_KEY` | no | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Bypasses RLS |
| `SUPABASE_JWT_SECRET` | **yes** | Local JWT verification |
| `EXTERNAL_API_BASE_URL` | no | Increff CIMS base |
| `EXTERNAL_API_USERNAME` | **yes** | |
| `EXTERNAL_API_PASSWORD` | **yes** | |
| `N8N_WEBHOOK_URL` | maybe | Optional, transitional |
| `OFFLINE_GRACE_SECONDS` | no | Default 259200 (72h) |
| `MIN_SUPPORTED_VERSION` | no | Floor (also enforced via AppVersion) |
| `STORAGE_BUCKET_REPORTS/RESULTS/SCREENSHOTS` | no | Bucket names |

## 3. Admin portal — Vercel

1. Import the repo into Vercel; set **Root Directory = `apps/admin`** (or use the
   committed `apps/admin/vercel.json`, which sets framework, build command, output
   dir, and the SPA rewrite).
2. Add Project Environment Variables (Production): `VITE_BACKEND_URL` (the prod
   backend URL), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. All public.
3. CI deploy: `deploy-admin.yml` runs on pushes to `apps/admin/**` using the
   Vercel CLI (`vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`).
   Requires GitHub secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
4. Add the deployed admin URL to the backend's `CORS_ORIGINS`.

## 4. Desktop releases & auto-update

Two-layer model: **GitHub Releases** delivers the bits; the backend **`AppVersion`**
table decides policy (optional vs forced update).

### Release process
1. One-time: in `apps/desktop/electron-builder.yml`, set
   `publish.owner` / `publish.repo` to your GitHub org/repo (currently
   `REPLACE_OWNER` / `REPLACE_REPO`), and place `resources/icon.ico`.
2. Bump versions and tag:
   ```bash
   git tag v1.2.0 && git push origin v1.2.0
   ```
3. `release-desktop.yml` (on `windows-latest`) installs, builds
   `@rg/shared` + `@rg/automation` + `@rg/desktop`, then runs
   `electron-builder --win --publish always` with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
   It publishes the **NSIS installer** + **`latest.yml`** to the GitHub Release for
   that tag. `latest.yml` is the electron-updater feed.
4. Installed clients (`electron-updater`, `services/updater.ts`) check the GitHub
   Releases feed on launch + periodically, download in the background, verify the
   signature, and install on quit.

### Code signing (recommended for production)
Uncomment the `CSC_LINK` / `CSC_KEY_PASSWORD` env in `release-desktop.yml` and add
those GitHub secrets (`CSC_LINK` = base64 `.pfx` or URL, `CSC_KEY_PASSWORD` = its
password). Without signing, Windows SmartScreen will warn on install.

### Forced-update gate (how `minSupported` works)
- In the admin portal **Versions** page, publish an `AppVersion` and tick
  **Forced update** (`minSupported = true`). This `POST /api/v1/admin/versions`.
- On every license check (`POST /license/validate`) and before every sync, the
  backend compares the client's `appVersion` to the latest `minSupported` version.
- If the client is older, the backend returns `RG-APP-001`
  (`APP_UPDATE_REQUIRED`); the desktop **blocks syncing** and prompts the user to
  update — which it can do because the new build is already on the Releases feed.
- This decouples "the bits are available" (GitHub Releases) from "you must take
  them now" (backend policy), so you can ship optional updates and later flip the
  gate if a Myntra selector change makes old clients unsafe.

## 5. Required GitHub secrets (summary)

| Secret | Used by | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` (auto) | release-desktop | Create/upload the GitHub Release |
| `CSC_LINK` | release-desktop | Code-signing cert (optional) |
| `CSC_KEY_PASSWORD` | release-desktop | Cert password (optional) |
| `DATABASE_URL` | deploy-backend | Pooled prod DB URL (for migrate) |
| `DIRECT_URL` | deploy-backend | Direct prod DB URL (for migrate) |
| `RENDER_DEPLOY_HOOK_URL` | deploy-backend | Trigger Render deploy (default) |
| `RAILWAY_TOKEN` | deploy-backend | Railway deploy (alternative) |
| `VERCEL_TOKEN` | deploy-admin | Vercel CLI auth |
| `VERCEL_ORG_ID` | deploy-admin | Vercel org |
| `VERCEL_PROJECT_ID` | deploy-admin | Vercel project |

> All runtime app secrets (Supabase service role, external-API creds) are set in
> the **host** dashboards (Render/Railway/Vercel/Supabase), **not** in GitHub —
> GitHub secrets are only for the CI/CD steps above.
