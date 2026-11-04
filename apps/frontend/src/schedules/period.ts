import { addDays, mondayOf, todayLocal } from '../time/helsinki';

/** The API's limit (apps/backend/src/schedules/schedules.service.ts). */
export const MAX_PERIOD_DAYS = 42;

/** Calendar days from start to end, both included. */
export function daysInPeriod(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

/** A period as the API expects it, or the first problem found. */
export function checkPeriod(start: string, end: string): string | null {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(start) || !date.test(end)) return 'Enter the first and the last day.';
  if (end < start) return 'The last day cannot be before the first day.';
  if (daysInPeriod(start, end) > MAX_PERIOD_DAYS) return `A schedule covers at most ${MAX_PERIOD_DAYS} days.`;
  return null;
}

/** Next Monday to the Sunday three weeks later, a common planning period on Finnish wards. */
export function defaultPeriod(today: string = todayLocal()): { start: string; end: string } {
  const start = addDays(mondayOf(today), 7);
  return { start, end: addDays(start, 20) };
}
