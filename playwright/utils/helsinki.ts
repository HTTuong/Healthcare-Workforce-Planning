// Shift and availability times are written in Helsinki time with the offset of that day, as the UI sends them.

const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Helsinki',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function localText(instant: Date): string {
  const p = Object.fromEntries(partsFormat.formatToParts(instant).map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** 2026-10-24 and 22:00 give "2026-10-24T22:00:00+03:00". Throws for a time the spring clock change skips. */
export function helsinki(date: string, time: string): string {
  for (const offset of [3, 2]) {
    const instant = new Date(`${date}T${time}:00+0${offset}:00`);
    if (localText(instant) === `${date}T${time}`) return `${date}T${time}:00+0${offset}:00`;
  }
  throw new Error(`${date} ${time} does not exist in Helsinki time`);
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
