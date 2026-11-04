import { addDays, minutesBetween, toInstant } from '../time/helsinki';
import type { Requirement } from './types';

export interface RequirementRow {
  qualificationId: string;
  count: string;
}

export interface ShiftTimes {
  date: string;
  start: string;
  end: string;
}

/**
 * The instants of a shift entered as a local date, start time and end time. An end time at or before the start
 * time means the shift ends the next day, as a night shift does. Returns a message when a time does not exist.
 */
export function shiftInstants({ date, start, end }: ShiftTimes): { startsAt: Date; endsAt: Date; minutes: number; endDate: string } | string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter the date of the shift.';
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 'Enter a start and an end time.';
  if (start === end) return 'The end time must differ from the start time.';
  const endDate = end > start ? date : addDays(date, 1);
  const startsAt = toInstant(date, start);
  const endsAt = toInstant(endDate, end);
  // Only the last Sunday of March has a missing hour, from 03:00 to 04:00.
  if (!startsAt || !endsAt) return 'That time does not exist on this day, because the clocks move forward an hour.';
  return { startsAt, endsAt, minutes: minutesBetween(startsAt, endsAt), endDate };
}

/** Whole number from 1 up to a limit, or undefined. */
function positive(value: string, max: number): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const n = Number(value);
  return n >= 1 && n <= max ? n : undefined;
}

export const MAX_HEADCOUNT = 2147483647;

export function parseHeadcount(value: string): number | string {
  return positive(value, MAX_HEADCOUNT) ?? 'Enter at least 1 person.';
}

/** The requirement rows as the API expects them, or the first problem found. */
export function parseRequirements(rows: readonly RequirementRow[], headcount: number | undefined): Requirement[] | string {
  const seen = new Set<string>();
  const result: Requirement[] = [];
  for (const row of rows) {
    if (row.qualificationId === '') return 'Choose a qualification in every requirement row, or remove the row.';
    if (seen.has(row.qualificationId)) return 'Each qualification can appear only once.';
    seen.add(row.qualificationId);
    const count = positive(row.count, MAX_HEADCOUNT);
    if (count === undefined) return 'A requirement needs at least 1 person.';
    if (headcount !== undefined && count > headcount) return `A requirement cannot need more than the ${headcount} people of the shift.`;
    result.push({ qualificationId: Number(row.qualificationId), count });
  }
  return result;
}

export interface RequirementChanges {
  removed: number[];
  lowered: Requirement[];
  raisedOrAdded: Requirement[];
}

/**
 * How to move a shift's requirements from before to after with the per requirement endpoints. The API refuses a
 * headcount below a requirement count and a requirement count above the headcount at every step, so the save runs:
 * remove, lower, change the shift, then raise and add.
 */
export function requirementChanges(before: readonly Requirement[], after: readonly Requirement[]): RequirementChanges {
  const old = new Map(before.map((r) => [r.qualificationId, r.count]));
  const next = new Map(after.map((r) => [r.qualificationId, r.count]));
  return {
    removed: before.filter((r) => !next.has(r.qualificationId)).map((r) => r.qualificationId),
    lowered: after.filter((r) => old.has(r.qualificationId) && r.count < old.get(r.qualificationId)!),
    raisedOrAdded: after.filter((r) => !old.has(r.qualificationId) || r.count > old.get(r.qualificationId)!)
  };
}
