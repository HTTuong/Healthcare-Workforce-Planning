import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseLocalDate } from './parse.js';

describe('parseLocalDate', () => {
  it('returns a real calendar date unchanged', () => {
    expect(parseLocalDate('2026-11-02', 'periodStart')).toBe('2026-11-02');
    expect(parseLocalDate('2028-02-29', 'periodStart')).toBe('2028-02-29');
  });

  it('refuses a day that does not exist instead of rolling it over (F-03)', () => {
    for (const value of ['2027-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-11-00']) {
      expect(() => parseLocalDate(value, 'periodStart'), value).toThrow(`periodStart ${value} is not a real calendar date`);
    }
  });

  it('refuses anything that is not exactly YYYY-MM-DD', () => {
    for (const value of ['2026-11-2', '2026/11/02', '2026-11-02T00:00:00Z', ' 2026-11-02', '', 20261102, null, undefined]) {
      expect(() => parseLocalDate(value, 'periodEnd'), String(value)).toThrow(BadRequestException);
    }
  });
});
