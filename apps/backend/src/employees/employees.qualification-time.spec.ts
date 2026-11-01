import { describe, expect, it } from 'vitest';
import { isQualificationValid } from './employees.service.js';

// The expiry date is a Helsinki calendar date, not a UTC one (found while designing the scheduling engine).
describe('isQualificationValid in Helsinki local time', () => {
  const lastValidDay = new Date('2026-11-06T00:00:00Z');

  it('is still valid at 23:59 local time on the last valid day', () => {
    expect(isQualificationValid(lastValidDay, new Date('2026-11-06T21:59:00Z'))).toBe(true);
  });

  it('has expired at 00:30 local time on the next day, while the UTC date is still the last valid day', () => {
    expect(isQualificationValid(lastValidDay, new Date('2026-11-06T22:30:00Z'))).toBe(false);
  });

  it('uses the summer offset of three hours as well', () => {
    const summerDay = new Date('2026-07-06T00:00:00Z');
    expect(isQualificationValid(summerDay, new Date('2026-07-06T20:59:00Z'))).toBe(true);
    expect(isQualificationValid(summerDay, new Date('2026-07-06T21:00:00Z'))).toBe(false);
  });
});
