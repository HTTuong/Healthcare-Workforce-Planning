import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MAX_INT32, parseInstant, parsePositiveInt } from './parse.js';

describe('parseInstant', () => {
  it('accepts a real timestamp with Z or an offset', () => {
    expect(parseInstant('2026-10-25T08:00:00+02:00', 'startsAt')).toEqual(new Date('2026-10-25T06:00:00Z'));
    expect(parseInstant('2026-10-25T06:00Z', 'startsAt')).toEqual(new Date('2026-10-25T06:00:00Z'));
    expect(parseInstant('2026-10-25T06:00:00.250+14:00', 'startsAt')).toEqual(new Date('2026-10-24T16:00:00.250Z'));
  });

  it('rejects days that do not exist instead of moving them to the next month (F-03)', () => {
    for (const value of ['2027-02-30T08:00:00+02:00', '2027-04-31T06:00:00+03:00', '2027-02-29T08:00:00Z', '2027-13-01T08:00:00Z', '2027-01-00T08:00:00Z']) {
      expect(() => parseInstant(value, 'startsAt'), value).toThrow(BadRequestException);
    }
  });

  it('knows leap years', () => {
    expect(parseInstant('2028-02-29T08:00:00Z', 'startsAt')).toEqual(new Date('2028-02-29T08:00:00Z'));
    expect(() => parseInstant('2100-02-29T08:00:00Z', 'startsAt')).toThrow(BadRequestException);
  });

  it('rejects impossible times and offsets', () => {
    for (const value of ['2027-03-10T24:00:00+02:00', '2027-03-10T08:60:00Z', '2027-03-10T08:00:60Z', '2027-03-10T08:00:00+15:00', '2027-03-10T08:00:00+02:60']) {
      expect(() => parseInstant(value, 'startsAt'), value).toThrow(BadRequestException);
    }
  });

  it('still requires a UTC offset and a string', () => {
    expect(() => parseInstant('2027-03-10T08:00:00', 'startsAt')).toThrow(BadRequestException);
    expect(() => parseInstant(1_800_000_000_000, 'startsAt')).toThrow(BadRequestException);
  });
});

describe('parsePositiveInt', () => {
  it('accepts 1 up to the largest database integer', () => {
    expect(parsePositiveInt(1, 'count')).toBe(1);
    expect(parsePositiveInt(MAX_INT32, 'count')).toBe(MAX_INT32);
  });

  it('rejects a number that does not fit in a database integer (F-02)', () => {
    expect(() => parsePositiveInt(MAX_INT32 + 1, 'count')).toThrow(BadRequestException);
    expect(() => parsePositiveInt(3_000_000_000, 'count')).toThrow(BadRequestException);
  });
});
