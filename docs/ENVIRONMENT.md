# Environment Variables

Consolidated catalogue of every environment variable across the three apps. "Where
it lives" is the canonical location in production; for local dev all live in the
corresponding `.env` file. **Secret** vars must never be committed, bundled into
the client, or returned to clients.

Per-app examples:
- `apps/backend/.env.example`
- `apps/admin/.env.example`
- `apps/desktop/.env.example`

---

## Backend — `@rg/backend`

Lives in the host (Render/Railway) dashboard in production; `apps/backend/.env`
locally.

| Var | Secret | Example | Notes |
| --- | --- | --- | --- |
| `PORT` | no | `4000` | HTTP port (host often injects) |
| `CORS_ORIGINS` | no | `https://admin.returngenie.app,http://localhost:5174` | Comma-separated allowlist (admin + desktop origins) |
| `DATABASE_URL` | **yes** | `postgresql://…@…pooler.supabase.com:6543/postgres?pgbouncer=true` | Pooled (PgBouncer) — runtime |
| `DIRECT_URL` | **yes** | `postgresql://…@…pooler.supabase.com:5432/postgres` | Direct — Prisma Migrate + pg-boss DDL |
| `SUPABASE_URL` | no | `https://PROJECT.supabase.co` | Project URL |
| `SUPABASE_ANON_KEY` | no | `eyJ…` | Public anon key (JWT verify, password grant proxy) |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | `eyJ…` | Bypasses RLS for trusted writes + Storage admin |
| `SUPABASE_JWT_SECRET` | **yes** | `super-secret-…` | Local JWT verification (no network round-trip) |
| `EXTERNAL_API_BASE_URL` | no | `https://cims.increff.com` | Increff CIMS base |
| `EXTERNAL_API_USERNAME` | **yes** | `svc-returngenie` | External upload API user — **server-only** |
| `EXTERNAL_API_PASSWORD` | **yes** | `••••••••` | External upload API password — **server-only** |
| `N8N_WEBHOOK_URL` | maybe | `https://n8n.…/webhook/…` | Optional transitional; empty = call external API directly |
| `OFFLINE_GRACE_SECONDS` | no | `259200` | Offline grace before hard-stop (72h) |
| `MIN_SUPPORTED_VERSION` | no | `0.1.0` | Version floor (also enforced via `AppVersion` gate) |
| `STORAGE_BUCKET_REPORTS` | no | `reports` | Raw report bucket |
| `STORAGE_BUCKET_RESULTS` | no | `results` | Results CSV bucket |
| `STORAGE_BUCKET_SCREENSHOTS` | no | `screenshots` | Failure screenshot bucket |

## Admin portal — `@rg/admin`

Vite only exposes `VITE_*` to the browser. Lives in the Vercel project env in
production; `apps/admin/.env.local` locally. **None are secrets** (anon key is
public by design; access is enforced by backend SUPERADMIN checks + RLS).

| Var | Secret | Example | Notes |
| --- | --- | --- | --- |
| `VITE_BACKEND_URL` | no | `https://api.returngenie.app` | Backend base (no trailing slash; admin appends `/api/v1`) |
| `VITE_SUPABASE_URL` | no | `https://PROJECT.supabase.co` | Used for SUPERADMIN login |
| `VITE_SUPABASE_ANON_KEY` | no | `eyJ…` | Public anon key — **never** the service-role key |

## Desktop — `@rg/desktop`

Read by the **main process** (`apps/desktop/src/main/config.ts`); the renderer
never reads env directly. Marketplace credentials are **never** env vars — they go
into the OS keystore (DPAPI / Credential Manager) at runtime. Set at build time or
by the launcher; `apps/desktop/.env` locally.

| Var | Secret | Example | Notes |
| --- | --- | --- | --- |
| `RG_BACKEND_URL` | no | `https://api.returngenie.app` | Backend base (without `/api/v1`) |
| `RG_SUPABASE_URL` | no | `https://PROJECT.supabase.co` | For CSP `connect-src` + Realtime |
| `RG_SUPABASE_ANON_KEY` | no | `eyJ…` | Public anon key (RLS enforces tenancy) |
| `RG_DEVICE_SALT` | no | `return-genie-device-v1` | Salt mixed into device fingerprint hash |
| `RG_SYNC_POLL_MS` | no | `4000` | Backend processing-status poll interval |
| `RG_UPDATE_CHECK_MS` | no | `21600000` | Auto-update check interval (6h) |

### Automation tuning (optional, read by `@rg/automation` / utility process)

| Var | Secret | Example | Notes |
| --- | --- | --- | --- |
| `HEADLESS` | no | `false` | Automation host forces headful (`false`) so the user can watch |
| `RG_PACE` | no | `1` | Human-pause multiplier (higher = slower/safer) |
| `MYNTRA_PROXY_URL` | maybe | `http://user:pass@host:port` | Route Myntra traffic via a proxy (also honors `HTTPS_PROXY`/`HTTP_PROXY`) |
| `MYNTRA_LOGIN_TIMEOUT_MS` | no | `90000` | Login watchdog (default 90s) |
| `MYNTRA_REPORT_TIMEOUT_MS` | no | `900000` | Report-generation watchdog (default 15m) |

---

## CI/CD secrets (GitHub Actions, not app runtime)

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) §5 for the full list:
`GITHUB_TOKEN` (auto), `CSC_LINK`, `CSC_KEY_PASSWORD`, `DATABASE_URL`,
`DIRECT_URL`, `RENDER_DEPLOY_HOOK_URL` (or `RAILWAY_TOKEN`), `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
