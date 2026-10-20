import { BadRequestException } from '@nestjs/common';

// An explicit UTC offset is mandatory, so "08:00" can never mean two different instants (R-TIME).
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseInstant(value: unknown, field: string): Date {
  const message = `${field} must be an ISO 8601 timestamp with an offset, for example 2026-10-25T08:00:00+02:00`;
  if (typeof value !== 'string' || !INSTANT_PATTERN.test(value)) throw new BadRequestException(message);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(message);
  return date;
}

export function parsePositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return value;
}