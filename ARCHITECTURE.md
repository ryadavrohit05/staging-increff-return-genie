# Return Genie — Production Architecture

> Desktop SaaS automation platform. Browser automation runs **locally** on the
> client machine (client's residential/business IP) to avoid Myntra IP blocks.
> A cloud backend handles auth, licensing, sync metadata, processing, and the
> external upload API (whose credentials never leave the server).
>
> This document is the migration target. The reference implementation lives at
> `D:\Using VNC` (`myntra-pipeline-dashboard` v2.0.0). We **evolve** it — we do
> not rewrite the Playwright engine, we lift it into a new shell.

---

## 0. What we keep, change, and kill (migration ledger)

| Reference (`D:\Using VNC`) | Decision | Target |
| --- | --- | --- |
| `scripts/downloadFromMyntra.js` (stealth login, selector fallbacks, calendar logic, debug snapshots) | **KEEP — crown jewel** | `packages/automation/src/marketplaces/myntra/` |
| `scripts/uploadToN8n.js` (multipart, results CSV parse) | **KEEP, relocate** | becomes backend-side; desktop no longer calls n8n directly |
| `scripts/run-pipeline.js` (orchestrator) | **REWRITE** | desktop `automation` utility process orchestrator |
| `agent/index.js` (Express + socket.io + pkg `.exe`) | **KILL** | replaced by Electron main + IPC |
| socket.io local streaming | **KILL (local)** | Electron IPC for local logs; Supabase Realtime for cloud sync state |
| `client/app.jsx` (Babel CDN React) | **REWRITE** | Vite + React + TS + Tailwind in `apps/desktop/renderer` |
| `.env` credential storage | **KILL** | OS keystore via `safeStorage` (DPAPI) + `keytar` |
| VNC stack (Xvfb/x11vnc/noVNC/LocalTunnel) | **KILL** | not needed — automation is local & headful, user watches the real browser |
| `scripts/phone-home.js` + HMAC callbacks | **KILL** | not needed — no remote runner |
| `.github/workflows/run-automation.yml` (`PIPELINE_MODE=github`) | **KILL** | the whole reason for the rebuild: runners get IP-blocked |
| `setup.iss` (Inno Setup) + `pkg` | **KILL** | `electron-builder` NSIS + `electron-updater` |
| `server/index.js` dual-mode | **EVOLVE** | multi-tenant SaaS backend (Express + Prisma + Supabase) |
| n8n as direct CSV target | **EVOLVE → retire from critical path** | backend mediates; see §12 |

**Single most important architectural change:** the desktop app **must not**
talk to n8n or the external upload API directly. It uploads the raw report to
*our backend*; the backend owns reconstruction + external-API credentials.

---

## 1. System architecture (high level)

```
┌──────────────────────────── CLIENT MACHINE (90+ clients) ─────────────────────────────┐
│                                                                                        │
│   ┌─────────────────────────── Return Genie Desktop (Electron) ──────────────────────┐ │
│   │                                                                                   │ │
│   │  RENDERER (React+TS+Tailwind)        MAIN PROCESS (Node)        UTILITY PROCESS   │ │
│   │  ┌───────────────────────┐  IPC      ┌──────────────────┐  fork ┌──────────────┐ │ │
│   │  │ Login / Dashboard     │◀────────▶│ App lifecycle     │──────▶│ Automation    │ │ │
│   │  │ Credentials UI        │ (preload  │ Auth/token store  │       │ engine        │ │ │
│   │  │ Sync console (logs)   │  bridge)  │ License gate      │       │ (Playwright   │ │ │
│   │  │ Results / history     │           │ Keystore (creds)  │       │  + Chromium)  │ │ │
│   │  │ Settings / updates    │           │ API client (JWT)  │       │  headful      │ │ │
│   │  └───────────────────────┘           │ Updater           │       └──────┬───────┘ │ │
│   │         ▲                            │ Realtime sub      │              │ download │ │
│   │         │ Supabase Realtime (sync    └────────┬──────────┘              ▼ CSV      │ │
│   │         │  state, RLS-scoped)                 │ HTTPS (JWT)        local temp dir  │ │
│   └─────────┼──────────────────────────────────────────────────────────────┼─────────┘ │
│             │                                     │                          │           │
│        OS KEYSTORE (DPAPI / Credential Manager)   │              Myntra Seller Portal    │
│        marketplace creds, encrypted               │              (client's own IP) ◀─────┘
└─────────────────────────────────────────────────┼──────────────────────────────────────┘
                                                    │ HTTPS REST + multipart (raw report)
                                                    ▼
┌────────────────────────────────── CLOUD (SaaS) ───────────────────────────────────────┐
│                                                                                        │
│  ┌──────────── Backend API (Express+Prisma) ─────────┐    ┌───── Supabase ──────────┐  │
│  │  /auth  /license  /devices  /sync  /admin         │───▶│ Auth (email/pw, JWT,    │  │
│  │  ┌─────────────────────────────────────────────┐  │    │       refresh, RLS)     │  │
│  │  │ Processing service                          │  │    │ Postgres (multi-tenant) │  │
│  │  │  reconstruct → validate → upload → reconcile│──┼───▶│ Storage (reports/results│  │
│  │  │  external-API creds live HERE only          │  │    │          + screenshots) │  │
│  │  └─────────────────────────────────────────────┘  │    │ Realtime (sync_runs)    │  │
│  └──────────────────┬────────────────────────────────┘    └─────────────────────────┘  │
│                     │                                                                    │
│                     ▼ (optional, transitional)        ┌──── Admin Portal (React/Vite) ─┐│
│              n8n (low-code glue, being retired)        │ clients, licenses, devices,    ││
│                     │                                  │ sync monitoring, versions      ││
│                     ▼                                  └────────────────────────────────┘│
│          External Upload API (Increff CIMS)           Hosted: Vercel                     │
│          (creds in backend only)                                                         │
│  Hosted: Railway/Render                                                                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Service boundaries (the four deployables)

| # | Service | Stack | Hosting | Owns |
| --- | --- | --- | --- | --- |
| 1 | **Desktop app** | Electron, React, Tailwind, TS, Playwright | client machine (NSIS installer) | automation, local logs, marketplace creds (encrypted, local-only) |
| 2 | **Backend API** | Node, Express, Prisma | Railway / Render | auth verify, licensing, device registry, sync metadata, **processing + external-API creds**, admin APIs, version metadata |
| 3 | **Admin portal** | React + Vite + TS + Tailwind | Vercel | operator UI over backend admin APIs |
| 4 | **Supabase** | Auth + Postgres + Storage + Realtime + RLS | Supabase (free → Pro) | identity, multi-tenant data, artifact storage, realtime fan-out |

Auto-updates: **GitHub Releases** as the update feed (`electron-updater`),
**GitHub Actions** as the build/sign/publish pipeline.

---

## 2. Monorepo folder structure

pnpm workspace + Turborepo. TypeScript everywhere. One repo, four deployables,
shared types/contracts so the desktop and backend can never drift.

```
return-genie/
├─ package.json                      # pnpm workspaces + turbo
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ .github/workflows/
│  ├─ ci.yml                         # lint + typecheck + test on PR
│  ├─ release-desktop.yml            # build + sign + publish to GitHub Releases
│  ├─ deploy-backend.yml             # deploy to Railway/Render
│  └─ deploy-admin.yml               # deploy to Vercel
│
├─ packages/
│  ├─ shared/                        # @rg/shared — zero runtime deps
│  │  └─ src/
│  │     ├─ contracts/               # zod schemas = single source of truth
│  │     │  ├─ auth.ts  device.ts  license.ts  sync.ts  marketplace.ts  admin.ts
│  │     ├─ types/                   # inferred TS types from zod
│  │     ├─ events/ipc-channels.ts   # typed IPC channel names + payloads
│  │     ├─ events/sync-state.ts     # SyncState enum (myntra:starting, ...) — see §15
│  │     └─ errors/codes.ts          # canonical error codes (RG-AUTH-001 ...)
│  │
│  ├─ automation/                    # @rg/automation — the migrated engine
│  │  └─ src/
│  │     ├─ engine/
│  │     │  ├─ browser.ts            # launch chromium + stealth, proxy, ctx
│  │     │  ├─ retry.ts              # withRetry(), backoff, attempt budget
│  │     │  ├─ humanize.ts           # humanPause/humanType (from reference)
│  │     │  ├─ snapshot.ts           # dumpDebugSnapshot → png+html on failure
│  │     │  └─ logger.ts             # structured JSON line logger → IPC
│  │     ├─ marketplaces/
│  │     │  ├─ types.ts              # MarketplaceAdapter interface
│  │     │  ├─ myntra/
│  │     │  │  ├─ login.ts           # performLogin, clickUseEmailAndPassword
│  │     │  │  ├─ navigate.ts        # selectField (STORE/PARTNER TYPE/REPORT)
│  │     │  │  ├─ dates.ts           # calendar + React-setter + humanType
│  │     │  │  ├─ generate.ts        # GENERATE REPORT + waitForCompletedRow
│  │     │  │  ├─ download.ts        # waitForEvent('download') capture
│  │     │  │  ├─ selectors.ts       # ALL selector strings, versioned
│  │     │  │  └─ adapter.ts         # implements MarketplaceAdapter
│  │     │  └─ flipkart/             # future — same interface
│  │     └─ run.ts                   # runAutomation(job): orchestrates a sync
│  │
│  └─ config/                        # shared eslint, tsconfig, tailwind presets
│
└─ apps/
   ├─ desktop/                       # @rg/desktop — Electron
   │  ├─ electron-builder.yml
   │  ├─ src/
   │  │  ├─ main/
   │  │  │  ├─ index.ts              # app lifecycle, single-instance, protocol
   │  │  │  ├─ windows.ts            # BrowserWindow factory (secure defaults)
   │  │  │  ├─ ipc/                  # ipcMain.handle() registrations
   │  │  │  │  ├─ auth.ipc.ts  creds.ipc.ts  sync.ipc.ts  app.ipc.ts
   │  │  │  ├─ services/
   │  │  │  │  ├─ keystore.ts        # safeStorage + keytar (§5)
   │  │  │  │  ├─ token-store.ts     # JWT/refresh in safeStorage
   │  │  │  │  ├─ api-client.ts      # backend REST, auto-refresh, retry
   │  │  │  │  ├─ license-gate.ts    # validate before sync (§8)
   │  │  │  │  ├─ device.ts          # fingerprint + registration
   │  │  │  │  ├─ realtime.ts        # Supabase Realtime subscription
   │  │  │  │  ├─ automation-host.ts # spawn utilityProcess, pipe events
   │  │  │  │  └─ updater.ts         # electron-updater wiring
   │  │  │  └─ automation-worker.ts  # entry for utilityProcess.fork
   │  │  ├─ preload/
   │  │  │  └─ index.ts              # contextBridge: window.rg = {...}
   │  │  └─ renderer/                # Vite + React + Tailwind + TS
   │  │     ├─ index.html  main.tsx  router.tsx
   │  │     ├─ lib/ipc.ts            # typed wrappers over window.rg
   │  │     ├─ store/                # zustand: auth, sync, settings
   │  │     ├─ pages/
   │  │     │  ├─ Login.tsx  Dashboard.tsx  Credentials.tsx
   │  │     │  ├─ SyncConsole.tsx  History.tsx  Results.tsx  Settings.tsx
   │  │     └─ components/           # Timeline, LogTerminal, StatCards, ...
   │  └─ resources/                  # icons, entitlements
   │
   ├─ backend/                       # @rg/backend — Express + Prisma
   │  ├─ prisma/schema.prisma        # §3
   │  ├─ supabase/                   # migrations + RLS policies (SQL)
   │  │  └─ policies/*.sql
   │  └─ src/
   │     ├─ index.ts                 # bootstrap, helmet, cors, rate-limit
   │     ├─ middleware/
   │     │  ├─ auth.ts               # verify Supabase JWT → req.ctx
   │     │  ├─ tenant.ts             # resolve org, scope all queries
   │     │  ├─ license.ts            # enforce active license/device
   │     │  └─ error.ts              # error → RG-code + structured log
   │     ├─ modules/
   │     │  ├─ auth/                 # login/refresh proxy, me, logout
   │     │  ├─ devices/              # register, list, revoke, heartbeat
   │     │  ├─ licenses/             # validate, status
   │     │  ├─ sync/                 # create run, upload report, status, list
   │     │  ├─ processing/           # ★ reconstruct → validate → upload → reconcile
   │     │  │  ├─ reconstruct.ts  validate.ts  uploader.ts  reconcile.ts
   │     │  │  └─ external-api.ts    # ONLY place external creds are used
   │     │  ├─ versions/             # latest version, min-supported gate
   │     │  └─ admin/                # org/user/device/sync/version admin APIs
   │     ├─ services/
   │     │  ├─ supabase.ts  storage.ts  queue.ts (BullMQ/pg-boss)  audit.ts
   │     └─ jobs/                    # async processing workers
   │
   └─ admin/                         # @rg/admin — Vite React SPA
      └─ src/{pages,components,lib}/ # clients, licenses, devices, sync, versions
```

---

## 3. Database schema (Prisma + Supabase Postgres, multi-tenant)

Every tenant-owned row carries `org_id`. RLS enforces isolation at the DB layer
so a bug in the API cannot leak across tenants. **No marketplace credentials and
no external-API credentials are ever stored here** (§5, §11).

```prisma
// prisma/schema.prisma  (datasource = Supabase Postgres)

model Organization {
  id            String   @id @default(uuid())
  name          String
  slug          String   @unique
  status        OrgStatus @default(ACTIVE)      // ACTIVE | SUSPENDED | DEACTIVATED
  maxDevices    Int      @default(2)            // license: device cap
  createdAt     DateTime @default(now())
  users         User[]
  devices       Device[]
  licenses      License[]
  marketplaceAccounts MarketplaceAccount[]
  syncRuns      SyncRun[]
  auditLogs     AuditLog[]
}

model User {
  id            String   @id              // == Supabase auth.users.id
  orgId         String
  email         String   @unique
  role          Role     @default(MEMBER) // OWNER | ADMIN | MEMBER  (SUPERADMIN = platform)
  status        UserStatus @default(ACTIVE)
  lastSeenAt    DateTime?
  org           Organization @relation(fields: [orgId], references: [id])
  @@index([orgId])
}

model Device {
  id            String   @id @default(uuid())
  orgId         String
  userId        String
  fingerprint   String                       // hashed machine id (§8)
  hostname      String
  os            String
  appVersion    String
  status        DeviceStatus @default(ACTIVE) // ACTIVE | REVOKED
  lastHeartbeat DateTime?
  registeredAt  DateTime @default(now())
  org           Organization @relation(fields: [orgId], references: [id])
  @@unique([orgId, fingerprint])
  @@index([orgId])
}

model License {
  id            String   @id @default(uuid())
  orgId         String
  plan          String                       // e.g. "standard"
  status        LicenseStatus @default(ACTIVE) // ACTIVE | EXPIRED | CANCELLED
  maxDevices    Int      @default(2)
  validFrom     DateTime @default(now())
  validUntil    DateTime                      // subscription expiry
  org           Organization @relation(fields: [orgId], references: [id])
  @@index([orgId])
}

// Marketplace ACCOUNT METADATA ONLY — never the password.
model MarketplaceAccount {
  id            String   @id @default(uuid())
  orgId         String
  marketplace   Marketplace                   // MYNTRA | FLIPKART
  label         String                        // e.g. "Myntra - PPMP"
  credRef       String                        // opaque local keystore ref (no secret)
  lastUsedAt    DateTime?
  org           Organization @relation(fields: [orgId], references: [id])
  @@index([orgId])
}

model SyncRun {
  id            String   @id @default(uuid())
  orgId         String
  userId        String
  deviceId      String
  marketplace   Marketplace
  startDate     String                        // YYYY-MM-DD filter
  endDate       String
  state         SyncState @default(QUEUED)     // §15 lifecycle
  phase         String?                        // fine-grained: "myntra:downloading"
  reportPath    String?                        // Supabase Storage key (raw report)
  resultPath    String?                        // Storage key (results csv)
  totalRows     Int?
  successRows   Int?
  failedRows    Int?
  skippedRows   Int?
  errorCode     String?                        // RG-* code on failure
  errorMessage  String?
  screenshotKey String?                        // Storage key for failure screenshot
  attempt       Int      @default(1)
  startedAt     DateTime @default(now())
  finishedAt    DateTime?
  org           Organization @relation(fields: [orgId], references: [id])
  logs          SyncLog[]
  results       SyncResult[]
  @@index([orgId, startedAt])
}

model SyncLog {
  id        String   @id @default(uuid())
  syncRunId String
  ts        DateTime @default(now())
  level     LogLevel                          // INFO | WARN | ERROR
  stage     String                            // myntra | processing | upload | system
  message   String
  run       SyncRun  @relation(fields: [syncRunId], references: [id])
  @@index([syncRunId, ts])
}

model SyncResult {                            // per-row outcome from external API
  id        String   @id @default(uuid())
  syncRunId String
  orderId   String
  status    RowStatus                         // SUCCESS | FAILED | SKIPPED
  error     String?
  run       SyncRun  @relation(fields: [syncRunId], references: [id])
  @@index([syncRunId])
}

model AppVersion {
  id           String  @id @default(uuid())
  version      String  @unique               // semver
  channel      String  @default("stable")    // stable | beta
  minSupported Boolean @default(false)        // gate: below latest minSupported = forced update
  releaseNotes String?
  releasedAt   DateTime @default(now())
}

model AuditLog {
  id        String   @id @default(uuid())
  orgId     String?
  actorId   String?
  action    String                            // "license.update", "device.revoke", ...
  target    String?
  meta      Json?
  ts        DateTime @default(now())
  @@index([orgId, ts])
}

enum OrgStatus { ACTIVE SUSPENDED DEACTIVATED }
enum UserStatus { ACTIVE DISABLED }
enum Role { SUPERADMIN OWNER ADMIN MEMBER }
enum DeviceStatus { ACTIVE REVOKED }
enum LicenseStatus { ACTIVE EXPIRED CANCELLED }
enum Marketplace { MYNTRA FLIPKART }
enum SyncState { QUEUED RUNNING DOWNLOADING PROCESSING UPLOADING SUCCEEDED FAILED CANCELLED }
enum LogLevel { INFO WARN ERROR }
enum RowStatus { SUCCESS FAILED SKIPPED }
```

### Row-Level Security (Supabase)

JWT carries `org_id` and `role` in `app_metadata`. Policies read them via
`auth.jwt()`. Pattern for every tenant table:

```sql
alter table sync_runs enable row level security;

-- tenant read: only your org
create policy sync_runs_select on sync_runs for select
  using (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

-- writes go through the backend service role (bypasses RLS) after tenant checks,
-- OR scoped insert for the owning org:
create policy sync_runs_insert on sync_runs for insert
  with check (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'));

-- platform superadmin escape hatch
create policy sync_runs_superadmin on sync_runs for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');
```

Realtime is enabled on `sync_runs` and `sync_logs`; the desktop subscribes only
to its own `org_id` rows (RLS applies to Realtime too).

---

## 4. Electron architecture (3-process model + security)

**Decision: three processes.** Renderer never touches Node, Playwright runs in
an isolated `utilityProcess` (not main, not renderer) so a browser crash or
memory leak can't take down the UI or the privileged main process.

```
Renderer (React)  ──IPC(invoke)──▶  Main (Node, privileged)  ──fork──▶  Utility (Playwright)
   sandboxed                          keystore, tokens, API           headful Chromium
   contextIsolation:true              license gate, updater            no network to backend
   nodeIntegration:false              ─────── pipes events ───────▶    (backend only via main)
```

### Secure window defaults (`windows.ts`)
```ts
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,     // mandatory
    nodeIntegration: false,     // mandatory
    sandbox: true,
    preload: path.join(__dirname, '../preload/index.js'),
  },
});
// CSP (no remote code; renderer assets are bundled):
//   default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
//   connect-src 'self' https://<backend> https://<supabase>.supabase.co wss://<supabase>.supabase.co;
//   img-src 'self' data:; object-src 'none'; frame-ancestors 'none';
session.defaultSession.webRequest // attach CSP header
app.on('web-contents-created', (_e, c) => {
  c.setWindowOpenHandler(() => ({ action: 'deny' }));   // no popups
  c.on('will-navigate', (e) => e.preventDefault());      // no in-app nav away
});
```

### Preload — the only bridge
```ts
// preload/index.ts — expose a narrow, typed, validated surface. No ipcRenderer leak.
import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '@rg/shared/events/ipc-channels';

contextBridge.exposeInMainWorld('rg', {
  auth:  { login: (p) => ipcRenderer.invoke(CH.AUTH_LOGIN, p),
           logout: () => ipcRenderer.invoke(CH.AUTH_LOGOUT),
           me: () => ipcRenderer.invoke(CH.AUTH_ME) },
  creds: { save: (p) => ipcRenderer.invoke(CH.CREDS_SAVE, p),     // marketplace creds
           status: (m) => ipcRenderer.invoke(CH.CREDS_STATUS, m),
           clear: (m) => ipcRenderer.invoke(CH.CREDS_CLEAR, m) },
  sync:  { start: (p) => ipcRenderer.invoke(CH.SYNC_START, p),
           cancel: (id) => ipcRenderer.invoke(CH.SYNC_CANCEL, id),
           onEvent: (cb) => { const h=(_,e)=>cb(e); ipcRenderer.on(CH.SYNC_EVENT,h);
                              return () => ipcRenderer.off(CH.SYNC_EVENT,h); } },
  app:   { version: () => ipcRenderer.invoke(CH.APP_VERSION),
           onUpdate: (cb) => { ipcRenderer.on(CH.APP_UPDATE, (_,e)=>cb(e)); } },
});
```

### IPC validation (main side)
Every `ipcMain.handle` validates its payload with the shared zod contract
*before* doing anything; reject on `senderFrame` mismatch; never `eval` a channel.
```ts
ipcMain.handle(CH.SYNC_START, async (e, raw) => {
  assertSameOrigin(e.senderFrame);            // reject foreign frames
  const input = SyncStartSchema.parse(raw);   // zod — throws → renderer gets typed error
  await licenseGate.assertCanSync();          // §8
  return automationHost.start(input);
});
```

### Automation host ↔ worker
- Main spawns `utilityProcess.fork(automation-worker.js)`.
- Worker imports `@rg/automation`, reads marketplace creds passed **in-memory via
  the fork message** (never written to disk, never logged).
- Worker emits structured events (`MessageChannelMain`) → main relays to renderer
  via `CH.SYNC_EVENT` and uploads metadata/logs to backend.
- Worker is killed on cancel, on app quit, and on idle timeout.

---

## 5. Marketplace credential storage (local-only, encrypted)

**Hard rule:** marketplace credentials live **only** on the client machine,
encrypted, never in the backend, never in the DB, never in logs.

**Layered design:**
1. **Primary — Electron `safeStorage`** (Windows: DPAPI per-user; macOS: Keychain;
   Linux: libsecret). `safeStorage.encryptString(password)` → ciphertext buffer.
2. **At-rest store** — ciphertext persisted in app data
   (`%APPDATA%/ReturnGenie/creds.enc`, mode 600). Only DPAPI/user can decrypt.
3. **Fallback / hardening — `keytar`** writes the marketplace secret directly to
   Windows Credential Manager when `safeStorage.isEncryptionAvailable()` is false.

```ts
// services/keystore.ts
async function saveCred(marketplace, { email, password }) {
  if (!safeStorage.isEncryptionAvailable()) return keytar.setPassword(SVC, marketplace, password);
  const blob = safeStorage.encryptString(JSON.stringify({ email, password }));
  await fs.writeFile(credFile(marketplace), blob, { mode: 0o600 });
  // store ONLY a non-secret ref to backend so admin can see "configured: yes"
}
async function loadCred(marketplace) { /* decrypt in-memory, return, never log */ }
```

Guarantees:
- **No plaintext at rest** — DPAPI-encrypted or in OS Credential Manager.
- **No backend storage** — backend only ever sees `credRef` ("configured: yes").
- **No credentials in logs** — logger has a redaction allowlist; password/email
  keys are masked at the serializer (`***`), enforced in `automation/logger.ts`.
- Creds are passed to the worker only via the in-memory fork message.

---

## 6. Authentication architecture

**Decision: Supabase Auth is the identity provider** (email/password, JWT access
+ refresh tokens, refresh rotation, RLS integration) — NOT Google. The Express
backend *verifies* Supabase JWTs and enriches them with `org_id`/`role`/license
state in `app_metadata`. This gets RLS for free and stays on the free tier.

```
Desktop login form
   │ email + password
   ▼
Main process → backend POST /auth/login  ──▶ Supabase Auth (password grant)
   │                                            returns { access, refresh }
   │ backend attaches device check + license snapshot
   ▼
Main stores tokens in safeStorage (token-store.ts), NEVER in renderer/localStorage
   │
   ▼  every API call: Authorization: Bearer <access>; auto-refresh on 401 via refresh token
backend middleware/auth.ts verifies JWT (Supabase JWKS), loads req.ctx = { userId, orgId, role }
```

- Access token short-lived (1 h); refresh token rotated; on rotation reuse →
  revoke session (Supabase handles).
- `app_metadata.org_id` / `role` are set by backend at user provisioning and read
  by both API middleware and RLS.
- Logout clears tokens from safeStorage and revokes the refresh token.

---

## 7. Multi-tenant model

- **Tenant = Organization.** Every user, device, sync, log, result is scoped by
  `org_id`. Enforced twice: backend `tenant.ts` middleware *and* Postgres RLS.
- **Roles:** `SUPERADMIN` (platform/Increff staff, cross-tenant, admin portal),
  `OWNER`/`ADMIN` (org-level), `MEMBER` (runs syncs).
- **90+ clients:** each is an Organization with its own users/devices/license.
  No noisy-neighbor concern because automation runs on the *client's* machine; the
  backend only does lightweight metadata + processing, which scales horizontally.
- Onboarding a client = create Org + License + OWNER user (admin portal), client
  installs desktop app, logs in, registers device, saves Myntra creds locally.

---

## 8. Licensing & device registration

```
App launch / pre-sync
   │
   ▼ POST /license/validate  { deviceFingerprint, appVersion }
backend:
   1. org.status == ACTIVE          else → RG-LIC-ORG-SUSPENDED
   2. license.status == ACTIVE
      && now < validUntil            else → RG-LIC-EXPIRED
   3. device known? if new → register; enforce count <= license.maxDevices
                                        else → RG-LIC-DEVICE-LIMIT
   4. device.status == ACTIVE        else → RG-LIC-DEVICE-REVOKED
   5. appVersion >= minSupported     else → RG-APP-UPDATE-REQUIRED (force update)
   ▼
returns { ok, license:{validUntil, plan}, gracePeriod }
```

- **Device fingerprint:** stable hash of machine id (`node-machine-id`) + OS user,
  salted; never reversible to PII. Registered on first launch
  (`POST /devices/register`), heartbeat on launch + each sync.
- **License gate is enforced server-side before every sync** (`POST /sync/runs`
  re-checks) *and* cached client-side for fast UX; offline grace period (e.g. 72 h)
  lets a client keep working if the backend is briefly unreachable, then hard-stops.
- **Activation/deactivation:** admin flips `org.status` / `license.status` /
  `device.status`; next validate call blocks the client.

---

## 9. Admin portal (Vercel)

React + Vite SPA over backend `/admin/*` (SUPERADMIN-only JWT). Modules:

| Module | Capabilities |
| --- | --- |
| Clients (orgs) | create/suspend/deactivate, set device cap, view users |
| Licenses | issue/renew/expire, change plan, set `validUntil`, `maxDevices` |
| Devices | list per org, see heartbeat/version, revoke |
| Sync monitoring | live runs, per-run logs/results, failure screenshots, filter by org/state/date |
| Versions | publish `AppVersion`, set `minSupported` (forced-update gate), channels |
| Logs/CSV history | browse `SyncRun` + download report/result artifacts from Storage |
| Audit | `AuditLog` of every admin action |

---

## 10. CSV processing architecture (the pipeline, server-side)

The reference did: Myntra CSV → n8n reconstruct → external upload → results.
We move the deterministic parts into the backend `processing` module so we own
validation, retries, partial success, and the external-API credentials.

```
Desktop                         Backend processing pipeline (modules/processing)
  download raw report  ──multipart──▶  POST /sync/runs/:id/report
  (Supabase Storage upload via            │ store raw → Storage (reports/<org>/<run>.csv)
   signed URL or backend proxy)           ▼
                                    1. reconstruct.ts   parse CSV/XLSX → normalized rows
                                       (marketplace-specific column mapping)
                                          ▼
                                    2. validate.ts      schema + business rules per row
                                       → {valid[], invalid[] with reasons}
                                          ▼  (invalid rows recorded as SKIPPED, not fatal)
                                    3. uploader.ts       batch valid rows → external-api.ts
                                       external-api.ts   ← creds from backend env ONLY
                                       per-row result: SUCCESS | FAILED | SKIPPED
                                          ▼  (per-row retry w/ backoff on transient 5xx/timeouts)
                                    4. reconcile.ts      persist SyncResult rows,
                                       roll up totals → SyncRun{total,success,failed,skipped}
                                       write results CSV → Storage (results/<org>/<run>.csv)
                                          ▼
                                    update SyncRun.state = SUCCEEDED (or FAILED)
                                          ▼  Supabase Realtime fires → desktop UI updates
```

**Partial success** is first-class: a run with `failedRows > 0 && successRows > 0`
ends `SUCCEEDED` with a non-zero failed count surfaced in the UI; failed rows are
retryable individually via **`POST /sync/runs/:id/retry-failed`** (re-uploads only
`FAILED` rows, never re-downloads from Myntra).

**Reconstruction logic** is a pure, unit-tested function per marketplace
(`reconstruct.myntra.ts`) — no browser, no network — so it's trivially testable
against fixture CSVs lifted from the reference downloads.

**Processing runs async** via a job queue (`pg-boss` on the same Postgres for free
tier, upgradeable to BullMQ/Redis) so the upload HTTP request returns immediately
and large reports don't hold a connection open.

---

## 11. External API integration (creds server-side only)

- External upload API (Increff CIMS) credentials live **only** in backend env
  (Railway/Render secrets), read only by `modules/processing/external-api.ts`.
- The desktop has **zero knowledge** of these creds and never calls the external
  API directly. It only ever talks to *our* backend with the user's JWT.
- `external-api.ts` is the single integration point: typed client, per-row retry,
  circuit breaker on sustained 5xx, structured logging with response codes (no
  secrets logged), idempotency key per row to avoid double-uploads on retry.

---

## 12. n8n strategy (boundaries + retirement plan)

| Horizon | What stays in n8n | What lives in backend code |
| --- | --- | --- |
| **Now (transitional)** | existing reconstruction + CIMS upload workflow, invoked **server-side** by backend (not by desktop) | auth, licensing, sync metadata, storage, orchestration |
| **Mid-term** | non-critical glue: Slack/email alerts, ad-hoc data fixes, experiments | deterministic reconstruction + validation + external upload move into `modules/processing` (versioned, tested, observable) |
| **Long-term** | retired from the critical path; optional ops webhooks only | all critical processing in backend; n8n is a convenience, not a dependency |

**Orchestration boundary:** the *backend* is always the orchestrator and the only
thing that holds external creds. If n8n is used at all, the backend calls it as an
internal service over a private webhook with a shared secret — n8n is never exposed
to the desktop. This removes the reference system's coupling where the agent posted
straight to `https://n8n.omni.increff.com/webhook/rohit`.

**Scalability:** moving reconstruction into code means it scales with the backend
(horizontal workers + queue) instead of a single n8n instance, and gives us retries,
idempotency, metrics, and tests that low-code flows can't.

---

## 13. Supabase integration (free tier first)

- **Auth:** email/password, JWT + refresh, `app_metadata` for `org_id`/`role`.
- **Postgres:** the schema in §3, managed by Prisma migrations; RLS on all tenant
  tables.
- **Storage:** buckets `reports/`, `results/`, `screenshots/`, pathed by
  `<org_id>/<sync_run_id>/...`; access via backend-minted signed URLs; Storage RLS
  scoped by org.
- **Realtime:** desktop subscribes to its org's `sync_runs`/`sync_logs` for live
  status without polling.
- **Free-tier discipline:** keep artifacts small (CSV), prune old artifacts via a
  retention job, use `pg-boss` (no Redis) for queues, lazy realtime subscriptions.
  Upgrade path to Supabase Pro is a config change, no re-architecture.

---

## 14. Electron security checklist

- [x] `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- [x] Preload exposes a narrow typed API; no `ipcRenderer` leaked to renderer
- [x] Every IPC handler zod-validates payload + checks `senderFrame`
- [x] Strict CSP; `connect-src` allowlists only backend + Supabase
- [x] `setWindowOpenHandler → deny`; block `will-navigate`; no `<webview>`
- [x] No remote code: renderer is fully bundled by Vite; no CDN scripts
      (kills the reference's Babel-CDN approach)
- [x] Tokens + creds in `safeStorage`/keystore, never `localStorage`
- [x] Auto-update signature verification (electron-updater + signed builds)
- [x] ASAR packaging; secrets never bundled into the app
- [x] Single-instance lock; custom protocol `returngenie://` validated/parsed safely

---

## 15. Reliability engineering

**Sync state machine** (shared `SyncState`, mirrors reference's `myntra:*` phases):
```
QUEUED → RUNNING → DOWNLOADING → (report uploaded) → PROCESSING → UPLOADING
       → SUCCEEDED
       ↘ FAILED (with errorCode + screenshot)        ↘ CANCELLED
```
Fine-grained `phase` strings (kept from the reference for UX parity):
`myntra:starting → logging-in → authenticated → filling-form → setting-dates →
generating → waiting-report → downloading → saved`, then
`processing:reconstruct → validate → upload → reconcile`.

| Concern | Mechanism |
| --- | --- |
| **Retries (automation)** | `withRetry()` per fragile step (login chooser click, dropdown select, calendar) with escalating strategies — exactly the reference's 4-strategy click, now generalized |
| **Retries (upload)** | per-row backoff in `uploader.ts`; idempotency keys; `retry-failed` endpoint |
| **Recovery** | each automation step is idempotent and re-entrant; a failed download re-runs the whole Myntra leg, a failed upload retries only rows |
| **Failure screenshots** | `snapshot.ts` (from `dumpDebugSnapshot`) captures PNG+HTML on any step failure → uploaded to Storage `screenshots/`, linked on the run + visible in admin |
| **Structured logs** | JSON line logs `{ts, level, stage, phase, message, runId}`; streamed to renderer via IPC and persisted to `SyncLog`; secrets redacted at serializer |
| **Version compatibility** | `minSupported` gate (§8); backend rejects syncs from too-old clients with `RG-APP-UPDATE-REQUIRED` |
| **Crash recovery** | utility-process crash → main marks run FAILED, surfaces error, offers retry; app relaunch reconciles any run left `RUNNING` past timeout → `FAILED` |
| **Cancel** | `SYNC_CANCEL` kills the worker + closes Chromium; run → CANCELLED |
| **Watchdogs** | login/report timeouts preserved from reference (`MYNTRA_LOGIN_TIMEOUT_MS=90000`, `MYNTRA_REPORT_TIMEOUT_MS=900000`) |

---

## 16. Auto-update flow

```
GitHub Actions (release-desktop.yml on tag v*)
  → electron-builder build (win NSIS) + code sign
  → publish artifacts + latest.yml to GitHub Releases
                         │
Desktop (electron-updater, services/updater.ts)
  → on launch + every N hours: checkForUpdates() against GitHub Releases feed
  → download in background → notify renderer (CH.APP_UPDATE) → user installs on quit
  → signature verified before apply
                         │
Backend AppVersion table = control plane
  → admin publishes version + can set minSupported=true to FORCE update
  → /license/validate returns RG-APP-UPDATE-REQUIRED → desktop blocks sync until updated
```

Two-layer model: **GitHub Releases** delivers bits; **backend `AppVersion`**
decides policy (optional vs forced).

---

## 17. Deployment architecture

| Component | Host | Notes |
| --- | --- | --- |
| Supabase (Auth/PG/Storage/Realtime) | Supabase free → Pro | single project, RLS multi-tenant |
| Backend API + processing workers | Railway or Render | env secrets hold external-API creds; horizontal scale; `pg-boss` queue on the same PG |
| Admin portal | Vercel | static SPA, JWT to backend |
| Desktop builds | GitHub Actions → GitHub Releases | signed NSIS, `electron-updater` feed |
| CI (lint/typecheck/test) | GitHub Actions | on every PR |

Cost posture: everything starts on free/low tiers; scaling levers are Supabase Pro,
a Render/Railway paid dyno, and (only if needed) Redis for BullMQ.

---

## 18. Production roadmap

**Phase 0 — Monorepo & contracts (week 1)**
Scaffold pnpm/turbo workspace, `@rg/shared` zod contracts, IPC channel/state enums,
CI. Port `downloadFromMyntra.js` into `@rg/automation` verbatim, wrap in
`MarketplaceAdapter`, add unit tests for `reconstruct`/`validate` against reference
CSVs.

**Phase 1 — Desktop shell (weeks 2–3)**
Electron 3-process skeleton, secure window + preload + IPC validation, renderer
(Login/Dashboard/Credentials/SyncConsole/History/Settings), keystore (`safeStorage`
+ keytar), utility-process automation host streaming logs to the console UI. Local
end-to-end Myntra download working headful.

**Phase 2 — Backend & auth (weeks 3–4)**
Supabase project, Prisma schema + migrations + RLS, Express API (auth verify,
tenant middleware), device register, license validate. Desktop logs in, registers
device, gated by license.

**Phase 3 — Processing pipeline (weeks 4–5)**
`modules/processing` (reconstruct/validate/uploader/reconcile), external-API client
with creds server-side, Storage for reports/results/screenshots, job queue, Realtime
status to desktop. Cut the desktop's direct n8n call.

**Phase 4 — Admin portal (week 6)**
Vercel SPA: clients, licenses, devices, sync monitoring, versions, audit.

**Phase 5 — Updates & hardening (week 7)**
electron-builder signed NSIS + electron-updater + GitHub Releases; `AppVersion`
forced-update gate; retry/crash-recovery polish; failure-screenshot wiring;
redaction audit; penetration pass on IPC + RLS.

**Phase 6 — Pilot → rollout (week 8+)**
Onboard 2–3 orgs, watch sync monitoring, tune selectors/timeouts, then roll to 90+.

### Scaling strategy
- **Automation scales for free** — it runs on each client's machine; adding clients
  adds no backend automation load.
- **Backend** is stateless behind the queue → scale horizontally; processing workers
  scale independently of the API.
- **DB** — RLS-partitioned by org; add read replicas / Supabase Pro as row counts grow;
  retention jobs prune old logs/artifacts.
- **Multi-marketplace** — new marketplaces are new `MarketplaceAdapter`
  implementations + a `reconstruct.<mp>.ts`; no core changes.
- **Selector resilience** — `selectors.ts` is versioned and centralized so a Myntra
  UI change is a one-file, hot-shippable fix delivered via auto-update.
```
