/**
 * Browser launcher: playwright-extra chromium + puppeteer-extra-plugin-stealth.
 *
 * The stealth plugin is what lets us past Akamai Bot Manager on
 * accounts.myntra.com — the single most load-bearing dependency in the engine.
 * Launch args, viewport and UA are ported verbatim from the reference
 * `downloadFromMyntra.js`.
 *
 * FRESH CONTEXT, ALWAYS: no storageState, no cookies, no session reuse. Every
 * run logs in from scratch (reference design decision — Myntra silently rejects
 * stale sessions).
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext, Page } from 'playwright';

// Register stealth once at module load. playwright-extra re-uses puppeteer
// plugins; the cast is required because the plugin's types target puppeteer.
chromium.use(StealthPlugin() as unknown as Parameters<typeof chromium.use>[0]);

/** Realistic desktop Chrome UA — kept in sync with the reference. */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

/** Shape Playwright's `launch({ proxy })` expects. */
export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

/**
 * Parse a proxy URL into Playwright's proxy config shape.
 *
 * Order of precedence (reference parity): the explicit `raw` argument, then
 * `MYNTRA_PROXY_URL`, `HTTPS_PROXY`, `HTTP_PROXY`. Returns `null` when no proxy
 * is configured or the URL is unparseable.
 */
export function parseProxyConfig(raw?: string): ProxyConfig | null {
  const source =
    raw ??
    process.env.MYNTRA_PROXY_URL ??
    process.env.HTTPS_PROXY ??
    process.env.HTTP_PROXY ??
    '';
  if (!source.trim()) return null;
  try {
    const u = new URL(source.trim());
    const cfg: ProxyConfig = {
      server: `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`,
    };
    if (u.username) cfg.username = decodeURIComponent(u.username);
    if (u.password) cfg.password = decodeURIComponent(u.password);
    return cfg;
  } catch {
    return null;
  }
}

export interface LaunchOptions {
  headless?: boolean; // default false (headful so the client watches)
  downloadDir: string; // acceptDownloads target
  proxyUrl?: string; // explicit proxy override
}

export interface LaunchResult {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  proxy: ProxyConfig | null;
}

/**
 * Launch a stealthed Chromium with a fresh, download-accepting context.
 * The caller owns teardown (`context.close()` / `browser.close()`).
 */
export async function launchBrowser(opts: LaunchOptions): Promise<LaunchResult> {
  const headless = opts.headless ?? false;

  const args = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    ...(headless ? [] : ['--start-maximized']),
  ];

  const proxy = parseProxyConfig(opts.proxyUrl);

  const browser = await chromium.launch({
    headless,
    args,
    ...(proxy ? { proxy } : {}),
  });

  // FRESH CONTEXT — no storageState, no cookies, no session reuse.
  const context = await browser.newContext({
    // Headful uses the real maximized window (viewport: null); headless needs an
    // explicit large viewport so the dual-month calendar renders fully.
    viewport: headless ? { width: 1920, height: 1080 } : null,
    acceptDownloads: true,
    userAgent: USER_AGENT,
  });

  const page = await context.newPage();

  // Operational policy: a native JS dialog (alert/confirm) must never block or
  // abort a run. Auto-dismiss them; accept beforeunload so navigation proceeds.
  page.on('dialog', (dialog) => {
    const fn = dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss();
    void fn.catch(() => {});
  });

  return { browser, context, page, proxy };
}
