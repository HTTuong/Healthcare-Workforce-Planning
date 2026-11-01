import { describe, expect, it } from 'vitest';
import {
  addDays,
  isoWeekday,
  localDateOf,
  minutesBetween,
  nextWeekStart,
  offsetMinutes,
  startOfLocalDate,
  weekStartOf
} from './local-time.js';

const TZ = 'Europe/Helsinki';

describe('local time helpers', () => {
  it('knows the Helsinki offset in summer and winter', () => {
    expect(offsetMinutes(new Date('2026-07-01T12:00:00Z'), TZ)).toBe(180);
    expect(offsetMinutes(new Date('2026-12-01T12:00:00Z'), TZ)).toBe(120);
  });

  it('gives the local date, which differs from the UTC date just after local midnight', () => {
    expect(localDateOf(new Date('2026-11-06T21:59:00Z'), TZ)).toBe('2026-11-06');
    expect(localDateOf(new Date('2026-11-06T22:30:00Z'), TZ)).toBe('2026-11-07');
  });

  it('finds local midnight on normal days and on both daylight saving days', () => {
    expect(startOfLocalDate('2026-07-01', TZ)).toEqual(new Date('2026-06-30T21:00:00Z'));
    expect(startOfLocalDate('2026-10-25', TZ)).toEqual(new Date('2026-10-24T21:00:00Z'));
    expect(startOfLocalDate('2026-10-26', TZ)).toEqual(new Date('2026-10-25T22:00:00Z'));
    expect(startOfLocalDate('2027-03-28', TZ)).toEqual(new Date('2027-03-27T22:00:00Z'));
    expect(startOfLocalDate('2027-03-29', TZ)).toEqual(new Date('2027-03-28T21:00:00Z'));
  });

  it('gives 25 hours on 25/10/2026 and 23 hours on 28/03/2027', () => {
    expect(minutesBetween(startOfLocalDate('2026-10-25', TZ), startOfLocalDate('2026-10-26', TZ))).toBe(25 * 60);
    expect(minutesBetween(startOfLocalDate('2027-03-28', TZ), startOfLocalDate('2027-03-29', TZ))).toBe(23 * 60);
  });

  it('adds days across month, year and leap day boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-11-02', -7)).toBe('2026-10-26');
  });

  it('numbers the days from Monday 1 to Sunday 7', () => {
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(isoWeekday('2026-10-25')).toBe(7);
  });

  it('finds the local Monday of a week, also from a Sunday night instant', () => {
    expect(weekStartOf(new Date('2026-10-21T10:00:00Z'), TZ)).toEqual(new Date('2026-10-18T21:00:00Z'));
    // Sunday 25/10 23:30 local is still in the week that started on 19/10.
    expect(weekStartOf(new Date('2026-10-25T21:30:00Z'), TZ)).toEqual(new Date('2026-10-18T21:00:00Z'));
    // Monday 26/10 00:30 local belongs to the next week.
    expect(weekStartOf(new Date('2026-10-25T22:30:00Z'), TZ)).toEqual(new Date('2026-10-25T22:00:00Z'));
  });

  it('gives a 169 hour week around 25/10/2026 and a 167 hour week around 28/03/2027', () => {
    const autumn = weekStartOf(new Date('2026-10-21T10:00:00Z'), TZ);
    const spring = weekStartOf(new Date('2027-03-24T10:00:00Z'), TZ);
    expect(minutesBetween(autumn, nextWeekStart(autumn, TZ))).toBe(169 * 60);
    expect(minutesBetween(spring, nextWeekStart(spring, TZ))).toBe(167 * 60);
  });
});
