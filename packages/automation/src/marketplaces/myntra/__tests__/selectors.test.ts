import { describe, expect, it } from 'vitest';
import {
  CALENDAR,
  DATE_INPUT,
  DEFAULTS,
  EMAIL_FIELD_SELECTOR,
  EMAIL_SELECTORS,
  LABELS,
  LOGIN_ERROR_PROBES,
  LOGIN_SELECTORS,
  PASSWORD_SELECTORS,
  REPORTS_READY_SELECTORS,
  REPORTS_URL,
  SELECTORS,
} from '../selectors.js';

describe('Myntra selectors', () => {
  it('exposes the partner reports URL', () => {
    expect(REPORTS_URL).toBe('https://partners.myntrainfo.com/Reports/ops-reports');
  });

  it('has non-empty default form values', () => {
    expect(DEFAULTS.store).toBe('MYNTRA');
    expect(DEFAULTS.partnerType).toBe('PPMP');
    expect(DEFAULTS.report).toBe('Seller_Returns_Report');
  });

  it('has the three form labels', () => {
    expect(LABELS.store).toBe('STORE');
    expect(LABELS.partnerType).toBe('PARTNER TYPE');
    expect(LABELS.report).toBe('REPORT');
  });

  it('every composite selector string is a non-empty string', () => {
    for (const [key, value] of Object.entries(SELECTORS)) {
      expect(typeof value, key).toBe('string');
      expect(value.length, key).toBeGreaterThan(0);
    }
  });

  it('all selector lists are non-empty arrays of non-empty strings', () => {
    const lists: Record<string, readonly string[]> = {
      EMAIL_SELECTORS,
      PASSWORD_SELECTORS,
      LOGIN_SELECTORS,
      LOGIN_ERROR_PROBES,
      REPORTS_READY_SELECTORS,
    };
    for (const [name, list] of Object.entries(lists)) {
      expect(list.length, name).toBeGreaterThan(0);
      for (const sel of list) {
        expect(typeof sel, name).toBe('string');
        expect(sel.length, name).toBeGreaterThan(0);
      }
    }
  });

  it('exposes the email field selector and calendar/date constants', () => {
    expect(EMAIL_FIELD_SELECTOR.length).toBeGreaterThan(0);
    expect(CALENDAR.day).toBe('.u-input-date-day');
    expect(CALENDAR.prev).toBe('.u-input-date-prev');
    expect(CALENDAR.next).toBe('.u-input-date-next');
    expect(DATE_INPUT.from).toBe('#from');
    expect(DATE_INPUT.to).toBe('#to');
  });
});
