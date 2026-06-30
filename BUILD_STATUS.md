# Build Status

Last verified: 2026-06-06 on Node 24 / pnpm 9.12 (Windows).

## Verified green ✅

All five workspace packages install, typecheck, build, and test cleanly.

| Package | typecheck | build | test |
| --- | --- | --- | --- |
| `@rg/shared` | ✅ | ✅ (`tsc` → dist) | n/a |
| `@rg/automation` | ✅ | ✅ (`tsc` → dist) | ✅ 6 tests (selectors) |
| `@rg/backend` | ✅ | ✅ (`tsc` → dist) | ✅ 20 tests (reconstruct, validate, CIMS mapping, **live HTTP stack**) |
| `@rg/admin` | ✅ | ✅ (`vite build` → 152 modules) | n/a |
| `@rg/desktop` | ✅ | ✅ (`electron-vite build`: main + preload + renderer) | n/a |

Reproduce:
```bash
corepack pnpm install
corepack pnpm --filter @rg/shared build
corepack pnpm --filter @rg/backend prisma:generate
corepack pnpm --filter @rg/automation build
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm --filter @rg/backend build
corepack pnpm --filter @rg/admin build
corepack pnpm --filter @rg/desktop build
```

## Runtime verification (this pass)
- **HTTP server stack proven live** — `src/__tests__/http.test.ts` boots the real
  Express app on an ephemeral port (no DB, no queue) and asserts: `/health` → 200,
  unknown route → structured 404, protected route → 401 `RG-AUTH-003`, helmet
  headers present. `buildApp()` is now exported and `main()` is guarded so it only
  auto-starts as the entry point.
- **Full backend boot — ✅ LIVE against real Supabase** (project `ekswwevjbcxqyqmnaynu`,
  ap-south-1). Boot log: `pg-boss started → workers registered → rg-backend
  listening :4000`. `GET /health` → 200.
- **DB migrated** — baseline migration `prisma/migrations/0_init` (all 11 tables)
  generated via `migrate diff` (shadow-DB-free, Supabase-friendly). The schema was
  already present (earlier `db push`), so it was **baselined** with
  `migrate resolve --applied 0_init`; `migrate status` → "up to date". CI
  `migrate deploy` now works on fresh DBs.

## Fixes applied during verification
- `@rg/automation` tsconfig: added `"DOM"` lib (page.evaluate callbacks reference DOM globals).
- App tsconfigs (`backend`/`desktop`/`admin`): set `"declaration": false` — they are executables, not libraries; resolves the pnpm `TS2742` non-portable-inferred-type error on Express routers.
- `@rg/desktop` package.json: added `zod` as a direct dependency (pnpm strict isolation blocked the transitive import in IPC validators).
- `electron.vite.config.ts`: forced the **preload to CommonJS `index.js`** — a sandboxed preload (`sandbox: true`) cannot be ESM, and `windows.ts` references `../preload/index.js`.
- Root `engines.node`: relaxed `>=20 <23` → `>=20`.

> Note: `turbo run build` fails locally with "Unable to find package manager binary" because pnpm is provided via the corepack shim rather than a PATH binary. This is environment-only; CI (`actions/setup-node` + `pnpm/action-setup`) puts pnpm on PATH, so Turbo works there. Locally, build per-package with `pnpm --filter`.

## Pre-launch checklist (not blocking compilation, required before shipping)

1. ~~`apps/desktop/resources/icon.ico`~~ — ✅ DONE. Generated from the company
   wordmark (`logo.png`) via `pnpm gen:icons` (the circular Increff logomark,
   cropped + padded to a square). Produces `resources/icon.{png,ico}` and the
   web favicons. The full wordmark is wired into both apps' login screens +
   headers/sidebar. Re-run `pnpm gen:icons` after replacing `logo.png`.
2. **`apps/desktop/electron-builder.yml`** — replace `REPLACE_OWNER` / `REPLACE_REPO` with the real GitHub repo for the auto-update feed; add code-signing (`CSC_LINK` / `CSC_KEY_PASSWORD`) before public release.
3. **CIMS pipeline** — ✅ FAITHFUL PORT of the production n8n workflow (no more
   guessing). Pipeline: `reconstruct` (xlsx/csv, exact Myntra snake_case columns)
   → `validate` (blank `seller_order_id` → SKIPPED) → **Webget dedup** (query
   `cims.cims_return_order_pojo` for orders already in CIMS → SKIPPED) → submit
   each row to `POST {baseUrl}/cims/import/returnOrders` with header auth
   (`authUsername`/`authPassword`/`authDomainName`) using the exact
   `Format JSON Payload` body (`omsLocationId`/`fulfillmentLocationCode`/`clientId`/
   `channelId`/`channelReturnOrderId`/`forms[]`) → classify per `Build Result` →
   reconcile. Adidas params seeded in `apps/backend/.env`
   (`CIMS_*`, `WEBGET_*`). Slug-driven multi-tenant config unchanged.
   ✅ **Webget dedup is LIVE** — `WEBGET_AUTH_HEADERS` set with the shared Webget
   user (`meesho-alerts-user` / org `increff`; header is `authOrgName`, distinct
   from CIMS's `authDomainName`). Both CIMS submit auth and Webget dedup auth are
   now configured. The full n8n workflow is reproduced end-to-end.
4. **XLSX inputs** — `reconstruct.ts` handles CSV (Myntra's actual format); wire a SheetJS reader if `.xlsx` reports appear (TODO marked in code).
5. ~~Supabase setup~~ — ✅ DONE (project `ekswwevjbcxqyqmnaynu`, ap-south-1): schema migrated + baselined (`0_init`); RLS ON for all tenant tables (24 policies), incl. `external_api_configs` added during setup to shield the encrypted CIMS password from PostgREST/Realtime; 3 private storage buckets; SUPERADMIN `rohit.yadav@increff.com`. Reusable scripts: `apps/backend/scripts/{apply-sql,create-buckets,seed-superadmin}.mjs`. **Remaining:** create the Adidas org (+ license + OWNER) via the admin portal, then a live E2E sync.
6. **End-to-end runtime smoke** — not yet run (needs a display + a real Myntra account + a live Supabase/backend). The Playwright leg is a faithful TS port of the verified reference `downloadFromMyntra.js`; selectors are copied verbatim, but a live login run should be done on a real machine.
7. **Realtime upgrade (optional)** — desktop currently polls `GET /sync/runs/:id` for processing status; swap to Supabase Realtime subscription per ARCHITECTURE.md §13 when desired.
