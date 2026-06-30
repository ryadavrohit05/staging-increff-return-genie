# @rg/desktop — Return Genie Desktop

Secure Electron (3-process model) + React + Tailwind + TypeScript app, built with
[`electron-vite`](https://electron-vite.org). It is the client shell described in
`ARCHITECTURE.md` §1, §4: a sandboxed React renderer, a privileged Node main
process, and an isolated Playwright `utilityProcess`.

## Processes

| Process | Entry | Responsibility |
| --- | --- | --- |
| Renderer | `src/renderer/main.tsx` | UI only. Sandboxed (`contextIsolation`, `nodeIntegration:false`, `sandbox`). Talks to main **only** via `window.rg` (preload). |
| Preload | `src/preload/index.ts` | The single typed bridge. Exposes a narrow `window.rg`; never leaks `ipcRenderer`. |
| Main | `src/main/index.ts` | App lifecycle, secure window, IPC, keystore, tokens, API client, license gate, device, updater, tray, automation host. |
| Utility | `src/main/automation-worker.ts` | `utilityProcess.fork` target. Imports `@rg/automation` and runs headful Playwright. Receives credentials in-memory only. |

## Security model (ARCHITECTURE.md §14)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Strict CSP attached via `session.webRequest` (`connect-src` allowlists only the
  backend + Supabase). Dev mode relaxes it for HMR.
- `setWindowOpenHandler → deny`; `will-navigate` blocked.
- Every `ipcMain.handle` zod-validates its payload and verifies the sender frame.
- Tokens and marketplace credentials live in the main process only, encrypted via
  Electron `safeStorage` (DPAPI), with a `keytar` fallback. Never in the renderer,
  never in `localStorage`, never logged.

## Configuration (env vars, read by the main process)

| Var | Default | Purpose |
| --- | --- | --- |
| `RG_BACKEND_URL` | `https://api.returngenie.increff.com` | Backend REST base (suffixed with `/api/v1`). |
| `RG_SUPABASE_URL` | placeholder | CSP `connect-src` + future Realtime. |
| `RG_SUPABASE_ANON_KEY` | _(empty)_ | Public anon key (RLS enforces tenancy). |
| `RG_DEVICE_SALT` | `return-genie-device-v1` | Salt mixed into the device fingerprint hash. |
| `RG_SYNC_POLL_MS` | `4000` | Backend processing-status poll interval. |
| `RG_UPDATE_CHECK_MS` | `21600000` | Auto-update check interval. |

## Scripts

```bash
pnpm --filter @rg/desktop dev        # electron-vite dev (HMR)
pnpm --filter @rg/desktop build      # electron-vite build (out/)
pnpm --filter @rg/desktop build:win  # build + electron-builder NSIS
pnpm --filter @rg/desktop typecheck
pnpm --filter @rg/desktop clean
```

> `@rg/shared` and `@rg/automation` must be built first (`pnpm -r build`), since
> the desktop imports their compiled `dist/`.

## ⚠️ Before packaging

- **`resources/icon.ico` must be supplied.** `electron-builder.yml` references
  `resources/icon.ico` for the window/tray/installer icon. The build will fail
  without it. Add a multi-resolution `.ico` (16–256 px) at `apps/desktop/resources/icon.ico`.
- **Update feed:** replace `owner: REPLACE_OWNER` / `repo: REPLACE_REPO` in
  `electron-builder.yml` with the real GitHub repository before publishing a
  release (the `electron-updater` feed points there).
- **Code signing:** configure signing certs in CI (`release-desktop.yml`) so
  `electron-updater` signature verification passes (ARCHITECTURE.md §16).

## Realtime (upgrade path)

The automation host currently **polls** `GET /sync/runs/:id` for backend
processing status (`RG_SYNC_POLL_MS`). ARCHITECTURE.md §13 calls for Supabase
Realtime on `sync_runs`/`sync_logs`; swapping the poller in
`services/automation-host.ts` for a Realtime subscription is a localized change.
