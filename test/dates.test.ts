import { describe, expect, it } from 'vitest';
import { displayDate } from '../src/dates.ts';

describe('editorial dates', () => {
  it('uses a padded day and a Russian month, optionally with a year', () => {
    const date = new Date('2026-09-08T00:00:00Z');
    expect(displayDate(date, false)).toBe('08 сентября');
    expect(displayDate(date)).toBe('08 сентября 2026');
  });
  it('uses the UTC calendar date at year boundaries', () => {
    expect(displayDate(new Date('2026-01-01T01:00:00+03:00'))).toBe('31 декабря 2025');
  });
});
