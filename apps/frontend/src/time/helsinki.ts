// Shift times are entered and shown in Helsinki local time (BR-T01) and stored as instants. This module is the only
// place that converts between the two. It relies on the browser's time zone data through Intl, so it works the same
// whatever time zone the user's computer is set to.

export const TIME_ZONE = 'Europe/Helsinki';

const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

/** The local calendar date (YYYY-MM-DD) and time (HH:MM) of an instant. */
export function localParts(instant: Date): { date: string; time: string } {
  const parts = Object.fromEntries(partsFormat.formatToParts(instant).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Minutes the local time is ahead of UTC at this instant: 120 in winter, 180 in summer. */
export function offsetMinutes(instant: Date): number {
  const { date, time } = localParts(instant);
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  return Math.round((asUtc - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * The instant of a local date and time. Returns null for a time that does not exist, such as 03:30 on the last
 * Sunday of March when the clocks jump from 03:00 to 04:00. A time that happens twice, such as 03:30 on the last
 * Sunday of October, gives the first one, which is still summer time.
 */
export function toInstant(date: string, time: string): Date | null {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) return null;
  // Helsinki is UTC+2 or UTC+3. Try both and keep the ones that read back as the same local time.
  const matches = [180, 120]
    .map((offset) => new Date(naive - offset * 60_000))
    .filter((instant) => {
      const parts = localParts(instant);
      return parts.date === date && parts.time === time;
    });
  return matches[0] ?? null;
}

/** The instant as the API expects it, in local time with its offset: 2026-10-24T22:00:00+03:00. */
export function toOffsetString(instant: Date): string {
  const { date, time } = localParts(instant);
  const offset = offsetMinutes(instant);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${date}T${time}:00${sign}${hh}:${mm}`;
}

/** Adds whole calendar days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const result = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000);
  return result.toISOString().slice(0, 10);
}

/** The Monday of the week that contains the date. */
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 is Sunday
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

export function todayLocal(now: Date = new Date()): string {
  return localParts(now).date;
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** A YYYY-MM-DD date for people: Sat 24 Oct 2026. */
export function formatDate(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`)).replace(',', '');
}

/** Real elapsed minutes, so a night across a clock change is 7 or 9 hours (BR-T02). */
export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
