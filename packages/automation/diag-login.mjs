/**
 * Login field diagnostic — drives a real browser to the Myntra login form using
 * the SAME engine code path, then probes how the email/password inputs respond
 * to click / focus / pressSequentially / fill, and runs the actual humanType().
 * Does NOT submit any login (dummy values only).
 *
 *   node diag-login.mjs
 */
import { launchBrowser } from './dist/engine/browser.js';
import { REPORTS_URL, EMAIL_SELECTORS, PASSWORD_SELECTORS } from './dist/marketplaces/myntra/selectors.js';
import { clickUseEmailAndPassword, detectAuthState } from './dist/marketplaces/myntra/login.js';
import { dismissNotificationPopup, dismissAlerts, findFirstVisible } from './dist/marketplaces/myntra/helpers.js';
import { humanType } from './dist/engine/humanize.js';

const noop = () => {};
const shot = async (page, name) => {
  try { await page.screenshot({ path: `D:\\rg-diag-${name}.png`, fullPage: false }); console.log('  shot:', name); }
  catch (e) { console.log('  shot failed:', name, e.message); }
};

async function probe(field, label) {
  if (!field) { console.log(`[${label}] NOT FOUND`); return; }
  const info = await field.evaluate((el) => ({
    tag: el.tagName, type: el.getAttribute('type'), name: el.getAttribute('name'),
    id: el.id, placeholder: el.getAttribute('placeholder'),
    disabled: el.disabled, readOnly: el.readOnly,
    contentEditable: el.isContentEditable,
    visible: !!(el.offsetWidth || el.offsetHeight),
  })).catch((e) => ({ error: e.message }));
  console.log(`[${label}] element:`, JSON.stringify(info));

  // 1) click → is it the active element?
  await field.click({ delay: 100 }).catch((e) => console.log(`  click err: ${e.message}`));
  const focusedAfterClick = await field.evaluate((el) => el === document.activeElement).catch(() => null);
  console.log(`  focused after click: ${focusedAfterClick}`);

  // 2) pressSequentially a dummy value
  await field.fill('').catch(() => {});
  await field.pressSequentially('diag-typed', { delay: 60 }).catch((e) => console.log(`  type err: ${e.message}`));
  const afterType = await field.inputValue().catch(() => '<no inputValue>');
  console.log(`  value after pressSequentially: "${afterType}"`);

  // 3) fill() a dummy value
  await field.fill('diag-filled').catch((e) => console.log(`  fill err: ${e.message}`));
  const afterFill = await field.inputValue().catch(() => '<no inputValue>');
  console.log(`  value after fill(): "${afterFill}"`);

  // 4) the ACTUAL humanType used by the engine
  await field.fill('').catch(() => {});
  await humanType(field, 'diag-humantype').catch((e) => console.log(`  humanType err: ${e.message}`));
  const afterHuman = await field.inputValue().catch(() => '<no inputValue>');
  console.log(`  value after humanType(): "${afterHuman}"  ${afterHuman === 'diag-humantype' ? 'OK ✅' : 'MISMATCH ❌'}`);
}

async function main() {
  console.log('Launching stealth Chromium (headful)…');
  const { browser, context, page } = await launchBrowser({ headless: false, downloadDir: 'D:\\rg-diag-tmp' });
  try {
    console.log('Navigating to', REPORTS_URL);
    await page.goto(REPORTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await shot(page, '1-landing');
    console.log('URL:', page.url());

    const state = await detectAuthState(page).catch(() => 'unknown');
    console.log('Auth state:', state);

    await dismissNotificationPopup(page).catch(() => {});
    await dismissAlerts(page).catch(() => {});

    console.log('Clicking "Use Email And Password"…');
    await clickUseEmailAndPassword(page, noop).catch((e) => console.log('chooser err:', e.message));
    await page.waitForTimeout(1500);
    await shot(page, '2-emailform');
    console.log('URL after chooser:', page.url());

    const emailField = await findFirstVisible(page, EMAIL_SELECTORS, 4000);
    await probe(emailField, 'EMAIL');

    const passwordField = await findFirstVisible(page, PASSWORD_SELECTORS, 4000);
    await probe(passwordField, 'PASSWORD');

    await shot(page, '3-after-type');
    console.log('\nKeeping browser open 6s for visual inspection…');
    await page.waitForTimeout(6000);
  } catch (e) {
    console.error('DIAG ERROR:', e.message);
    await shot(page, 'error');
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
