# resources/

Build resources consumed by `electron-builder` and the runtime tray.

## Icons (generated — do not hand-edit)

- **`icon.ico`** — Windows application/installer/tray icon (16/32/48/64/128/256 px).
- **`icon.png`** — 1024×1024 master used as the dev window icon.

Both are **generated from the company wordmark** at the repo root (`logo.png`) by:

```
pnpm gen:icons        # runs scripts/gen-icons.mjs (uses sharp + png-to-ico)
```

The generator crops the circular Increff logomark out of the wide wordmark and
pads it into a transparent square. It also emits the web favicons
(`apps/*/.../public/favicon.png`) and copies the full wordmark into each app's
asset folder for use in headers / login screens.

**Re-run `pnpm gen:icons` whenever `logo.png` changes.**
