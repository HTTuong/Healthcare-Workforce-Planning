import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatDate,
  formatDuration,
  localParts,
  minutesBetween,
  mondayOf,
  offsetMinutes,
  toInstant,
  toOffsetString,
  todayLocal
} from './helsinki';

describe('Helsinki time', () => {
  it('converts local winter and summer times to the right instant', () => {
    expect(toInstant('2026-11-02', '06:00')?.toISOString()).toBe('2026-11-02T04:00:00.000Z');
    expect(toInstant('2026-07-01', '06:00')?.toISOString()).toBe('2026-07-01T03:00:00.000Z');
  });

  it('writes the offset of the day, as the API expects', () => {
    expect(toOffsetString(new Date('2026-11-02T04:00:00Z'))).toBe('2026-11-02T06:00:00+02:00');
    expect(toOffsetString(new Date('2026-07-01T03:00:00Z'))).toBe('2026-07-01T06:00:00+03:00');
    expect(offsetMinutes(new Date('2026-07-01T03:00:00Z'))).toBe(180);
  });

  it('measures the night across the end of summer time as 9 hours (BR-T02)', () => {
    const start = toInstant('2026-10-24', '22:00')!;
    const end = toInstant('2026-10-25', '06:00')!;
    expect(toOffsetString(start)).toBe('2026-10-24T22:00:00+03:00');
    expect(toOffsetString(end)).toBe('2026-10-25T06:00:00+02:00');
    expect(minutesBetween(start, end)).toBe(9 * 60);
  });

  it('measures the night across the start of summer time as 7 hours', () => {
    expect(minutesBetween(toInstant('2027-03-27', '22:00')!, toInstant('2027-03-28', '06:00')!)).toBe(7 * 60);
  });

  it('refuses a time skipped by the clock change and takes the first of a repeated time', () => {
    expect(toInstant('2027-03-28', '03:30')).toBeNull();
    expect(toInstant('2027-03-28', '04:00')?.toISOString()).toBe('2027-03-28T01:00:00.000Z');
    expect(toInstant('2026-10-25', '03:30')?.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(toOffsetString(toInstant('2026-10-25', '03:30')!)).toBe('2026-10-25T03:30:00+03:00');
  });

  it('refuses dates and times that do not exist', () => {
    expect(toInstant('2026-02-30', '06:00')).toBeNull();
    expect(toInstant('2026-11-02', '24:00')).toBeNull();
    expect(toInstant('', '06:00')).toBeNull();
  });

  it('reads the local date of an instant near midnight correctly', () => {
    expect(localParts(new Date('2026-11-01T22:30:00Z'))).toEqual({ date: '2026-11-02', time: '00:30' });
    expect(todayLocal(new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-02');
  });

  it('finds the Monday of a week and moves by days across months and years', () => {
    expect(mondayOf('2026-11-04')).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(mondayOf('2026-11-02')).toBe('2026-11-02');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('formats dates and durations for people', () => {
    expect(formatDate('2026-10-24')).toBe('Sat 24 Oct 2026');
    expect(formatDuration(540)).toBe('9 h');
    expect(formatDuration(450)).toBe('7 h 30 min');
  });
});
