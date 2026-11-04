import { describe, expect, it } from 'vitest';
import { checkPeriod, daysInPeriod, defaultPeriod } from './period';

describe('schedule period', () => {
  it('counts calendar days, including both ends and the 25 hour day of 25 October', () => {
    expect(daysInPeriod('2026-11-02', '2026-11-02')).toBe(1);
    expect(daysInPeriod('2026-10-19', '2026-10-25')).toBe(7);
  });

  it('accepts 1 to 42 days and refuses 43', () => {
    expect(checkPeriod('2026-11-02', '2026-11-02')).toBeNull();
    expect(checkPeriod('2026-11-02', '2026-12-13')).toBeNull();
    expect(checkPeriod('2026-11-02', '2026-12-14')).toBe('A schedule covers at most 42 days.');
  });

  it('refuses an end before the start and missing dates', () => {
    expect(checkPeriod('2026-11-02', '2026-11-01')).toBe('The last day cannot be before the first day.');
    expect(checkPeriod('', '2026-11-01')).toBe('Enter the first and the last day.');
  });

  it('suggests next Monday to three weeks later', () => {
    expect(defaultPeriod('2026-11-04')).toEqual({ start: '2026-11-09', end: '2026-11-29' });
    expect(defaultPeriod('2026-11-08')).toEqual({ start: '2026-11-09', end: '2026-11-29' });
  });
});
