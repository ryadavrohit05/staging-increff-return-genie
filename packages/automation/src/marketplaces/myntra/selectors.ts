/**
 * Myntra Partner Portal selectors — the single source of truth.
 *
 * Centralized + versioned so a Myntra UI change is a one-file, hot-shippable fix
 * delivered via auto-update (ARCHITECTURE.md §18 — selector resilience).
 *
 * Every string here is copied VERBATIM from the reference
 * `D:\Using VNC\scripts\downloadFromMyntra.js`. Do not "tidy" them — the comma-
 * separated fallback lists and the exact XPath are hard-won against a flaky,
 * React-rendered, Akamai-protected portal.
 *
 * SELECTORS VERSION: 2026-06-06 (ported from reference v2.0.0)
 */

export const REPORTS_URL = 'https://partners.myntrainfo.com/Reports/ops-reports';

/** Default form values. */
export const DEFAULTS = {
  store: 'MYNTRA',
  partnerType: 'PPMP',
  report: 'Seller_Returns_Report',
} as const;

/** Operational Reports form labels (drive the dropdown-finder). */
export const LABELS = {
  store: 'STORE',
  partnerType: 'PARTNER TYPE',
  report: 'REPORT',
} as const;

/** accounts.myntra.com login chooser & email form. */
export const SELECTORS = {
  useEmailBtn:
    'button:has-text("Use Email And Password"), ' +
    'div[role="button"]:has-text("Use Email And Password"), ' +
    'text=/Use Email And Password/i',
  emailInput:
    'input[type="email"], input[name="email"], input[placeholder*="Email" i], ' +
    'label:has-text("Email") + input, label:has-text("Email") ~ input',
  passwordInput:
    'input[type="password"], input[name="password"], ' +
    'label:has-text("Password") + input, label:has-text("Password") ~ input',
  loginBtn:
    'button:has-text("LOG IN"), button:has-text("Log In"), button:has-text("Login"), ' +
    '[role="button"]:has-text("LOG IN")',

  // Date inputs (placeholder-based; the actual fields carry id #from / #to).
  dateInputs: 'input[placeholder*="YYYY-MM-DD" i], input[placeholder*="YYYY-MM-DC" i]',

  generateBtn:
    'button:has-text("GENERATE REPORT"), ' +
    'button:has-text("Generate Report"), ' +
    'button:has-text("GENERATE")',

  // Queue table download link.
  rowDownloadLink:
    'a:has-text("DOWNLOAD"), a:has-text("Download"), ' +
    'button:has-text("DOWNLOAD"), button:has-text("Download")',
} as const;

/** Email field candidates, in priority order (used by the chooser + login flow). */
export const EMAIL_FIELD_SELECTOR =
  'input[type="email"], input[name="email"], input[autocomplete="email"], ' +
  'input[autocomplete="username"], input[id*="email" i], input[placeholder*="Email" i]';

export const EMAIL_SELECTORS: readonly string[] = [
  'input[type="email"]',
  'input[name="email"]',
  'input[autocomplete="email"]',
  'input[autocomplete="username"]',
  'input[id*="email" i]',
  'input[placeholder*="Email" i]',
  'xpath=(//label[normalize-space(.)="Email"])[1]/following::input[not(@type="hidden") and not(@type="password")][1]',
];

export const PASSWORD_SELECTORS: readonly string[] = [
  'input[type="password"]',
  'input[name="password"]',
  'input[autocomplete="current-password"]',
  'input[id*="password" i]',
  'xpath=(//*[normalize-space(text())="Password"])[1]/following::input[1]',
];

export const LOGIN_SELECTORS: readonly string[] = [
  'button:has-text("LOG IN")',
  'button:has-text("Log In")',
  'button:has-text("Login")',
  '[role="button"]:has-text("LOG IN")',
];

/** Login-error probes — any visible match means the credentials were rejected. */
export const LOGIN_ERROR_PROBES: readonly string[] = [
  'text=/Invalid\\s+(email|password|credentials)/i',
  'text=/Incorrect\\s+(email|password)/i',
  'text=/Wrong\\s+(email|password)/i',
  'text=/Authentication failed/i',
  'text=/Login failed/i',
  '[role="alert"]:visible',
];

/** Reports-page readiness indicators. */
export const REPORTS_READY_SELECTORS: readonly string[] = [
  'button:has-text("GENERATE REPORT")',
  'text=/Operational Reports/i',
];

/** Date picker (`.u-input-date`) classes — dual-month calendar widget. */
export const CALENDAR = {
  dayHeader: '.u-input-date-day-header',
  day: '.u-input-date-day',
  dayWithTitle: '.u-input-date-day[title]',
  prev: '.u-input-date-prev',
  next: '.u-input-date-next',
} as const;

/** Date input ids. */
export const DATE_INPUT = {
  from: '#from',
  to: '#to',
} as const;
