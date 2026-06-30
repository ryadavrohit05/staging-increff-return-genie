/**
 * Myntra date-range filling — ported from the reference calendar logic.
 *
 * The Myntra picker (`.u-input-date`) is a DUAL-MONTH calendar whose masked
 * input library OVERRIDES the input's `.value` property, defeating typed input
 * and naive setters. So the primary strategy is clicking day cells (matched by
 * their `title` attribute in `Date.toDateString()` form), paging the calendar to
 * the right month first. Fallbacks (React native setter → human typing →
 * aggressive multi-event setter) each verify the value actually stuck.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { AppError, ErrorCode } from '@rg/shared';
import { humanPause, humanType, rand } from '../../engine/humanize.js';
import { createLogger, type EmitFn } from '../../engine/logger.js';
import { STAGE } from './config.js';
import { CALENDAR, DATE_INPUT } from './selectors.js';
import { dismissAnyPopup, setReactInputValue } from './helpers.js';

/**
 * Find the day cell for a date if currently rendered & visible. Day cells carry
 * a unique `title` in `Date.toDateString()` form (e.g. "Sun May 31 2026").
 */
async function findDayCell(page: Page, dateStr: string): Promise<Locator | null> {
  const dt = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(dt.getTime())) return null;

  const title = dt.toDateString(); // "Sun May 31 2026"
  const loc = page.locator(`${CALENDAR.day}[title="${title}"]`).first();
  if ((await loc.count()) > 0 && (await loc.isVisible({ timeout: 500 }).catch(() => false))) {
    return loc;
  }
  return null;
}

/**
 * Which month(s) the calendar currently renders, derived from day-cell titles.
 * Returns [{ y, m }] (m 0-based).
 */
async function getDisplayedCalendarMonths(page: Page): Promise<Array<{ y: number; m: number }>> {
  return page.evaluate((daySel) => {
    const out: Record<number, { y: number; m: number }> = {};
    document.querySelectorAll(`${daySel}[title]`).forEach((el) => {
      const title = el.getAttribute('title');
      if (!title) return;
      const d = new Date(title);
      if (!Number.isNaN(d.getTime())) {
        out[d.getFullYear() * 12 + d.getMonth()] = { y: d.getFullYear(), m: d.getMonth() };
      }
    });
    return Object.keys(out).map((k) => out[Number(k)]!);
  }, CALENDAR.day);
}

/**
 * Page the open calendar (prev/next chevrons) until the target date's cell is
 * rendered, then return it.
 */
async function navigateCalendarToDate(page: Page, dateStr: string): Promise<Locator | null> {
  const target = new Date(dateStr + 'T00:00:00');
  const targetKey = target.getFullYear() * 12 + target.getMonth();

  for (let i = 0; i < 24; i++) {
    const cell = await findDayCell(page, dateStr);
    if (cell) return cell;

    const shown = await getDisplayedCalendarMonths(page);
    if (!shown.length) return null;

    const keys = shown.map((s) => s.y * 12 + s.m);
    const minKey = Math.min(...keys);
    const maxKey = Math.max(...keys);

    let arrowSel: string;
    if (targetKey < minKey) arrowSel = CALENDAR.prev;
    else if (targetKey > maxKey) arrowSel = CALENDAR.next;
    else return null; // month shown but cell isn't (empty/out-of-range)

    const arrow = page.locator(arrowSel).first();
    if ((await arrow.count()) === 0) return null;
    await arrow.click({ delay: rand(80, 160) }).catch(() => {});
    await humanPause(page, 500, 1000); // let the month transition render
  }
  return null;
}

/** Save the current page HTML so an unrecognized calendar layout can be inspected. */
async function dumpCalendarHtml(page: Page, label: string, dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const html = await page.content().catch(() => '');
    const file = path.join(dir, `myntra-calendar-${label}-${stamp}.html`);
    if (html) await fs.writeFile(file, html, 'utf8');
  } catch {
    /* best effort */
  }
}

/**
 * Pick start + end dates by clicking day cells, paging to the right month first.
 */
async function selectDatesViaCalendar(
  page: Page,
  startDate: string,
  endDate: string,
  screenshotDir: string,
): Promise<void> {
  // Open the calendar by clicking the start input.
  await page.locator(DATE_INPUT.from).click({ delay: rand(80, 160) });

  // Wait for the calendar popup to actually render.
  await page
    .locator(CALENDAR.dayHeader)
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .catch(() => {
      throw new Error('Calendar popup did not open after clicking #from');
    });
  await humanPause(page, 500, 1100);

  const startCell = await navigateCalendarToDate(page, startDate);
  if (!startCell) {
    await dumpCalendarHtml(page, 'start-not-found', screenshotDir);
    throw new Error(`Calendar day cell for ${startDate} not found`);
  }
  await startCell.scrollIntoViewIfNeeded().catch(() => {});
  await startCell.click({ delay: rand(80, 160) });

  await humanPause(page, 700, 1500);

  const endCell = await navigateCalendarToDate(page, endDate);
  if (!endCell) {
    await dumpCalendarHtml(page, 'end-not-found', screenshotDir);
    throw new Error(`Calendar day cell for ${endDate} not found`);
  }
  await endCell.scrollIntoViewIfNeeded().catch(() => {});
  await endCell.click({ delay: rand(80, 160) });

  await humanPause(page, 500, 1100);
  await dismissAnyPopup(page);
}

/** Read back both date inputs. */
async function readDates(page: Page): Promise<{ from: string; to: string }> {
  const from = await page.locator(DATE_INPUT.from).inputValue().catch(() => '');
  const to = await page.locator(DATE_INPUT.to).inputValue().catch(() => '');
  return { from, to };
}

/**
 * Fill the date range using escalating strategies, each verifying the value
 * actually stuck before moving on. Throws AUTO_FILTER_FAILED if none succeed.
 */
export async function fillDateRange(
  page: Page,
  startDate: string,
  endDate: string,
  screenshotDir: string,
  emit: EmitFn,
): Promise<void> {
  const log = createLogger(STAGE, emit);
  log.info(`  date range = ${startDate} → ${endDate}`);

  const fromInput = page.locator(DATE_INPUT.from).first();
  const toInput = page.locator(DATE_INPUT.to).first();
  if ((await fromInput.count()) === 0 || (await toInput.count()) === 0) {
    throw new AppError(
      ErrorCode.AUTO_FILTER_FAILED,
      'Could not locate the two date inputs (#from / #to).',
    );
  }

  // Strategy 1: calendar widget click (most reliable for masked inputs).
  try {
    await selectDatesViaCalendar(page, startDate, endDate, screenshotDir);
  } catch (e) {
    log.warn(`  calendar click failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  let { from, to } = await readDates(page);
  if (from === startDate && to === endDate) {
    log.info(`  dates set via calendar: ${from} → ${to}`);
    return;
  }

  // Strategy 2: React-safe native setter.
  log.warn(`  calendar values mismatch (${from}/${to}) — trying setter`);
  await setReactInputValue(page, DATE_INPUT.from, startDate);
  await setReactInputValue(page, DATE_INPUT.to, endDate);
  await dismissAnyPopup(page);

  ({ from, to } = await readDates(page));
  if (from === startDate && to === endDate) {
    log.info(`  dates set via setter: ${from} → ${to}`);
    return;
  }

  // Strategy 3: direct typing.
  log.warn("  setter didn't stick — falling back to typing");
  await dismissAnyPopup(page);
  await humanType(page.locator(DATE_INPUT.from), startDate);
  await dismissAnyPopup(page);
  await humanType(page.locator(DATE_INPUT.to), endDate);
  await dismissAnyPopup(page);

  ({ from, to } = await readDates(page));
  if (from === startDate && to === endDate) {
    log.info(`  dates set via typing: ${from} → ${to}`);
    return;
  }

  // Strategy 4: aggressive multi-event setter.
  log.warn("  typing didn't stick — final attempt");
  await page.evaluate(
    ({ s, e }) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      if (!setter) return;
      const setVal = (id: string, val: string) => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (!el) return;
        setter.call(el, val);
        for (const type of ['input', 'change', 'blur', 'keyup']) {
          el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        }
      };
      setVal('from', s);
      setVal('to', e);
    },
    { s: startDate, e: endDate },
  );
  await dismissAnyPopup(page);

  ({ from, to } = await readDates(page));
  log.info(`  dates final: ${from} → ${to}`);

  if (from !== startDate || to !== endDate) {
    throw new AppError(
      ErrorCode.AUTO_FILTER_FAILED,
      `Could not set dates. Got "${from}"/"${to}", expected "${startDate}"/"${endDate}"`,
    );
  }
}
