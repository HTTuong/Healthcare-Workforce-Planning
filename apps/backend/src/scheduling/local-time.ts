import type { LocalDate } from './engine.types.js';

// Calendar days and weeks in a time zone, computed from instants. Durations are never computed from clock times,
// so a day or a week around a daylight saving change has its real length (see docs/scheduling-engine.md).

const MINUTE = 60_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(instant: Date, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Minutes the time zone is ahead of UTC at this instant, for example 180 for Helsinki in summer. */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / MINUTE);
}

/** The local calendar date of an instant. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const p = localParts(instant, timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function parseLocalDate(date: LocalDate): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Not a local date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** The date a number of days later (or earlier when negative). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = parseLocalDate(date);
  const moved = new Date(Date.UTC(2000, 0, 1));
  moved.setUTCFullYear(year, month - 1, day + days);
  return moved.toISOString().slice(0, 10);
}

/** The instant of local midnight at the start of the date. */
export function startOfLocalDate(date: LocalDate, timeZone: string): Date {
  const [year, month, day] = parseLocalDate(date);
  const midnightAsUtc = new Date(Date.UTC(2000, 0, 1));
  midnightAsUtc.setUTCFullYear(year, month - 1, day);
  // Shift by the offset, then correct once in case the offset differs at the result (a change near midnight).
  let instant = new Date(midnightAsUtc.getTime() - offsetMinutes(midnightAsUtc, timeZone) * MINUTE);
  instant = new Date(midnightAsUtc.getTime() - offsetMinutes(instant, timeZone) * MINUTE);
  return instant;
}

/** Day of the week of a local date, 1 for Monday to 7 for Sunday. */
export function isoWeekday(date: LocalDate): number {
  const [year, month, day] = parseLocalDate(date);
  const noon = new Date(Date.UTC(2000, 0, 1, 12));
  noon.setUTCFullYear(year, month - 1, day);
  return noon.getUTCDay() === 0 ? 7 : noon.getUTCDay();
}

/** Local Monday 00:00 of the week that contains the instant (BR-H04). */
export function weekStartOf(instant: Date, timeZone: string): Date {
  const date = localDateOf(instant, timeZone);
  return startOfLocalDate(addDays(date, 1 - isoWeekday(date)), timeZone);
}

/** Local Monday 00:00 of the following week. */
export function nextWeekStart(weekStart: Date, timeZone: string): Date {
  return startOfLocalDate(addDays(localDateOf(weekStart, timeZone), 7), timeZone);
}

/** Real elapsed minutes from a to b. */
export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MINUTE;
}
