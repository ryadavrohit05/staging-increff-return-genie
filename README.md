# Return Genie

> Desktop SaaS automation platform for marketplace returns processing. Browser
> automation runs **locally** on each client's machine (their own residential/
> business IP) to avoid Myntra IP blocks; a cloud backend owns auth, licensing,
> sync metadata, server-side CSV processing, and the external upload API (whose
> credentials never leave the server).

This repo is the production target of a migration. The reference implementation
lives at `D:\Using VNC` (`myntra-pipeline-dashboard` v2.0.0) — a VNC/GitHub-runner
based system that kept getting **IP-blocked by Myntra** because automation ran in
the cloud. Return Genie **evolves** that system rather than rewriting it: the
proven Playwright engine (stealth login, selector fallbacks, calendar logic,
debug snapshots) is lifted verbatim into `@rg/automation` and wrapped in an
Electron desktop shell so the browser runs on the client's own IP, while the
cloud shrinks to a multi-tenant control + processing plane. The VNC stack,
GitHub-runner automation, and direct n8n coupling are all retired.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design (migration ledger,
DB schema, security model, reliability engineering, roadmap).

## System architecture

```
┌──────────────── CLIENT MACHINE (90+ clients) ─────────────────┐
│  Return Genie Desktop (Electron, 3 processes)                 │
│   Renderer (React/TS/Tailwind) ⇄ Main (Node: auth, keystore,  │
│   license gate, updater) ─fork→ Utility (Playwright, headful) │
│                       │                    │                  │
│            OS Keystore (DPAPI)      Myntra Seller Portal       │
│         marketplace creds, local      (client's own IP)        │
└───────────────────────┼───────────────────────────────────────┘
                        │ HTTPS REST + multipart (raw report), JWT
                        ▼
┌──────────────────────────── CLOUD (SaaS) ─────────────────────┐
│  Backend API (Express+Prisma)  ──▶  Supabase                  │
│   /auth /license /devices /sync       Auth (JWT, RLS)         │
│   /versions /admin                    Postgres (multi-tenant) │
│   Processing: reconstruct → validate  Storage (reports/       │
│     → upload → reconcile                results/screenshots)  │
│   external-API creds live HERE only   Realtime (sync_runs)    │
│         │                                                      │
│         ▼                          ┌─ Admin Portal (React) ──┐ │
│  External Upload API (Increff      │ clients, licenses,      │ │
│  CIMS) — creds server-side only    │ devices, sync, versions │ │
│  Backend host: Render/Railway      └─ Hosted: Vercel ────────┘ │
└────────────────────────────────────────────────────────────────┘
```

Four deployables: **Desktop** (client machine), **Backend API** (Render/Railway),
**Admin portal** (Vercel), **Supabase** (Auth + Postgres + Storage + Realtime).
Auto-updates ship via **GitHub Releases** (`electron-updater` feed) built by
**GitHub Actions**.

## Monorepo layout

pnpm workspaces + Turborepo, TypeScript everywhere. Shared zod contracts mean the
desktop and backend can never drift.

```
return-genie/
├─ packages/
│  ├─ shared/        @rg/shared      — zod contracts + types + error codes + IPC channels
│  ├─ automation/    @rg/automation  — the migrated Playwright engine (Myntra adapter)
│  └─ config/                        — shared eslint/tsconfig/tailwind presets
└─ apps/
   ├─ desktop/       @rg/desktop     — Electron app (Playwright runs here, locally)
   ├─ backend/       @rg/backend     — Express + Prisma API + server-side processing
   └─ admin/         @rg/admin       — Vite + React SPA over the backend admin APIs
```

Packages / apps:
- [`packages/shared`](./packages/shared) — `@rg/shared`
- [`packages/automation`](./packages/automation) — `@rg/automation`
- [`apps/desktop`](./apps/desktop) — `@rg/desktop`
- [`apps/backend`](./apps/backend) — `@rg/backend`
- [`apps/admin`](./apps/admin) — `@rg/admin`

## Local development

### Prerequisites
- **Node 20** (`>=20 <23`)
- **pnpm 9** (`npm i -g pnpm@9`)
- A **Supabase** project (free tier) for auth + Postgres + Storage — see
  [`docs/SETUP.md`](./docs/SETUP.md).

### 1. Install
```bash
pnpm install
```

### 2. Generate the Prisma client
```bash
pnpm db:generate
```

### 3. Configure environment
Each app reads its own `.env`. Copy the examples and fill them in (full table in
[`docs/ENVIRONMENT.md`](./docs/ENVIRONMENT.md)):
```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/admin/.env.example   apps/admin/.env.local
cp apps/desktop/.env.example apps/desktop/.env   # if present
```
Then run migrations against your Supabase database (see `docs/SETUP.md`):
```bash
pnpm db:migrate
```

### 4. Run the apps (separate terminals)
```bash
pnpm backend:dev    # Express API on http://localhost:4000
pnpm admin:dev      # Admin SPA on   http://localhost:5174
pnpm desktop:dev    # Electron app (electron-vite dev)
```

### Useful root scripts
| Script | What it does |
| --- | --- |
| `pnpm build` | Turbo build (builds `@rg/shared` first) |
| `pnpm typecheck` | Typecheck every package |
| `pnpm lint` | Lint every package |
| `pnpm test` | Run all tests |
| `pnpm db:generate` / `pnpm db:migrate` | Prisma generate / migrate (dev) |

## Docs
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — full system design
- [`docs/SETUP.md`](./docs/SETUP.md) — first-time Supabase + local setup
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — production deploy + release process
- [`docs/ENVIRONMENT.md`](./docs/ENVIRONMENT.md) — every environment variable
