import { BadRequestException } from '@nestjs/common';

// The largest value a PostgreSQL integer column can hold. Anything larger made Prisma fail with 500 (F-02).
export const MAX_INT32 = 2_147_483_647;

// An explicit UTC offset is mandatory, so "08:00" can never mean two different instants (R-TIME).
const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  const date = new Date(Date.UTC(2000, 0, 1));
  // setUTCFullYear does not map years 0 to 99 to the 1900s, unlike Date.UTC.
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

export function parseInstant(value: unknown, field: string): Date {
  const message = `${field} must be an ISO 8601 timestamp with an offset, for example 2026-10-25T08:00:00+02:00`;
  const match = typeof value === 'string' ? INSTANT_PATTERN.exec(value) : null;
  if (!match) throw new BadRequestException(message);
  const [, year, month, day, hour, minute, second = '00', zone, offsetHour = '00', offsetMinute = '00'] = match;
  // Every part is checked, because new Date() silently moves 30 February to 2 March (F-03).
  const valid =
    Number(month) >= 1 &&
    Number(month) <= 12 &&
    Number(day) >= 1 &&
    Number(day) <= daysInMonth(Number(year), Number(month)) &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59 &&
    (zone === 'Z' || (Number(offsetHour) <= 14 && Number(offsetMinute) <= 59));
  if (!valid) throw new BadRequestException(`${field} ${String(value)} is not a real date and time`);
  return new Date(value as string);
}

export function parsePositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_INT32) {
    throw new BadRequestException(`${field} must be a positive integer up to ${MAX_INT32}`);
  }
  return value;
}

export function parseNonEmptyText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }
  return value.trim();
}

/** A calendar date written YYYY-MM-DD, checked part by part like parseInstant (F-03). Returns the same text. */
export function parseLocalDate(value: unknown, field: string): string {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) throw new BadRequestException(`${field} must be a date in YYYY-MM-DD format`);
  const [, year, month, day] = match;
  const valid =
    Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= daysInMonth(Number(year), Number(month));
  if (!valid) throw new BadRequestException(`${field} ${String(value)} is not a real calendar date`);
  return value as string;
}
