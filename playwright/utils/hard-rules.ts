import type { Assignment, Shift } from '../api/types';
import { addDays, helsinki } from './helsinki';

// An independent check of the time rules, written from docs/business-rules.md and not from the engine, so a test can
// judge a generated schedule without trusting the engine's own validation.
// BR-H03: no two shifts of one person overlap. BR-H05: at least 11 h of real elapsed time between them.
// BR-H04: at most 40 h in a Monday to Sunday week in Helsinki time; a shift across Monday 00:00 counts in both weeks.

export interface Interval {
  startsAt: string;
  endsAt: string;
}

export interface TimeRuleBreak {
  rule: 'BR-H03' | 'BR-H04' | 'BR-H05';
  employeeId: number;
  detail: string;
}

const MIN_REST_MINUTES = 11 * 60;
const MAX_WEEK_MINUTES = 40 * 60;
const ms = (iso: string) => Date.parse(iso);
const minutes = (from: number, to: number) => Math.round((to - from) / 60_000);

/** Monday of the Helsinki week that contains this instant, as YYYY-MM-DD. */
function mondayOf(instant: number): string {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(instant));
  const weekday = (new Date(`${local}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(local, -weekday);
}

/** Work per person: the assignments of the schedule plus any other work they have, such as other wards' shifts. */
export function workByEmployee(shifts: Shift[], assignments: Assignment[], other: Array<Interval & { employeeId: number }> = []) {
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const work = new Map<number, Interval[]>();
  const add = (employeeId: number, interval: Interval) => work.set(employeeId, [...(work.get(employeeId) ?? []), interval]);
  for (const a of assignments) {
    const shift = byId.get(a.shiftId);
    if (!shift) throw new Error(`Shift ${a.shiftId} is not in the list the test passed`);
    add(a.employeeId, shift);
  }
  for (const o of other) add(o.employeeId, o);
  return work;
}

/** Every time rule the work breaks, as the rules describe them. An empty list means none. */
export function timeRuleBreaks(work: Map<number, Interval[]>): TimeRuleBreak[] {
  const found: TimeRuleBreak[] = [];
  for (const [employeeId, intervals] of work) {
    const sorted = [...intervals].sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const [a, b] = [sorted[i]!, sorted[j]!];
        if (ms(b.startsAt) < ms(a.endsAt)) {
          found.push({ rule: 'BR-H03', employeeId, detail: `${a.startsAt} overlaps ${b.startsAt}` });
        } else if (minutes(ms(a.endsAt), ms(b.startsAt)) < MIN_REST_MINUTES) {
          found.push({ rule: 'BR-H05', employeeId, detail: `${minutes(ms(a.endsAt), ms(b.startsAt))} min rest before ${b.startsAt}` });
        }
      }
    }
    const weeks = new Map<string, number>();
    for (const interval of sorted) {
      let monday = mondayOf(ms(interval.startsAt));
      while (ms(helsinki(monday, '00:00')) < ms(interval.endsAt)) {
        const from = Math.max(ms(interval.startsAt), ms(helsinki(monday, '00:00')));
        const to = Math.min(ms(interval.endsAt), ms(helsinki(addDays(monday, 7), '00:00')));
        if (to > from) weeks.set(monday, (weeks.get(monday) ?? 0) + minutes(from, to));
        monday = addDays(monday, 7);
      }
    }
    for (const [monday, total] of weeks) {
      if (total > MAX_WEEK_MINUTES) found.push({ rule: 'BR-H04', employeeId, detail: `${total} min in the week of ${monday}` });
    }
  }
  return found;
}

/** Minutes each person works in the Helsinki week that starts on this Monday. */
export function weekMinutes(work: Map<number, Interval[]>, monday: string): Map<number, number> {
  const from = ms(helsinki(monday, '00:00'));
  const to = ms(helsinki(addDays(monday, 7), '00:00'));
  const result = new Map<number, number>();
  for (const [employeeId, intervals] of work) {
    result.set(employeeId, intervals.reduce((sum, i) => sum + Math.max(0, minutes(Math.max(from, ms(i.startsAt)), Math.min(to, ms(i.endsAt)))), 0));
  }
  return result;
}
