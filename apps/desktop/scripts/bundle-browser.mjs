/**
 * Download Playwright's Chromium into apps/desktop/pw-browsers so electron-builder
 * can bundle it (extraResources) into the installer. This is what lets the
 * desktop app run on a client machine WITHOUT the client ever running
 * `playwright install`. Run automatically by the `build:win` script.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readdirSync, rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url)); // apps/desktop/scripts
const desktopDir = join(here, '..'); // apps/desktop
const repoRoot = join(desktopDir, '..', '..'); // repo root
const browsersDir = join(desktopDir, 'pw-browsers');

console.log('Downloading Chromium →', browsersDir);
const result = spawnSync(
  'corepack',
  ['pnpm', '--filter', '@rg/automation', 'exec', 'playwright', 'install', 'chromium'],
  {
    cwd: repoRoot,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir },
    stdio: 'inherit',
    shell: true,
  },
);
if (result.status !== 0) {
  console.error('Chromium download failed (exit', result.status, ')');
  process.exit(result.status ?? 1);
}

// We run HEADFUL only, so prune the headless-shell build (~170 MB) to shrink the
// installer. The full `chromium-*` (chrome-win64) is what the app launches.
if (existsSync(browsersDir)) {
  for (const entry of readdirSync(browsersDir)) {
    if (entry.startsWith('chromium_headless_shell')) {
      rmSync(join(browsersDir, entry), { recursive: true, force: true });
      console.log('Pruned', entry);
    }
  }
}
console.log('Chromium bundled into pw-browsers ✓');
