import { addDays, formatDate, localParts, toInstant } from '../time/helsinki';
import type { Availability } from './types';

export interface RangeFields {
  wholeDays: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

/**
 * The instants of a range entered in Helsinki time. Whole days run from 00:00 of the first day to 00:00 after the
 * last day, so a leave from Monday to Friday covers Friday night too. The end is not part of the range, so a range
 * that ends at 16:00 and one that starts at 16:00 do not overlap, as in the API.
 */
export function rangeInstants(fields: RangeFields): { startsAt: Date; endsAt: Date } | string {
  const dateOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!dateOk(fields.startDate) || !dateOk(fields.endDate)) return 'Enter a start and an end date.';
  let startsAt: Date | null;
  let endsAt: Date | null;
  if (fields.wholeDays) {
    startsAt = toInstant(fields.startDate, '00:00');
    endsAt = toInstant(addDays(fields.endDate, 1), '00:00');
  } else {
    if (!/^\d{2}:\d{2}$/.test(fields.startTime) || !/^\d{2}:\d{2}$/.test(fields.endTime)) return 'Enter a start and an end time.';
    startsAt = toInstant(fields.startDate, fields.startTime);
    endsAt = toInstant(fields.endDate, fields.endTime);
  }
  if (!startsAt || !endsAt) return 'That time does not exist on this day, because the clocks move forward an hour.';
  if (endsAt <= startsAt) return 'The end must be after the start.';
  return { startsAt, endsAt };
}

/** The first saved range that shares time with this one, ignoring the record being edited. */
export function findOverlap(
  records: readonly Availability[],
  startsAt: Date,
  endsAt: Date,
  ignoreId?: number
): Availability | undefined {
  return records.find(
    (record) => record.id !== ignoreId && new Date(record.startsAt) < endsAt && new Date(record.endsAt) > startsAt
  );
}

/** Mon 2 Nov 2026 08:00, or just the date when the range covers whole days. */
export function describeRange(startsAt: Date, endsAt: Date): string {
  const start = localParts(startsAt);
  const end = localParts(endsAt);
  if (start.time === '00:00' && end.time === '00:00') {
    const last = addDays(end.date, -1);
    return last === start.date ? `${formatDate(start.date)}, whole day` : `${formatDate(start.date)} to ${formatDate(last)}, whole days`;
  }
  const endText = end.date === start.date ? end.time : `${formatDate(end.date)} ${end.time}`;
  return `${formatDate(start.date)} ${start.time} to ${endText}`;
}

/** The form fields for an existing record. */
export function fieldsOf(record: Availability): RangeFields {
  const start = localParts(new Date(record.startsAt));
  const end = localParts(new Date(record.endsAt));
  const wholeDays = start.time === '00:00' && end.time === '00:00';
  return {
    wholeDays,
    startDate: start.date,
    startTime: wholeDays ? '08:00' : start.time,
    endDate: wholeDays ? addDays(end.date, -1) : end.date,
    endTime: wholeDays ? '16:00' : end.time
  };
}

