import type { Shift } from '../shifts/types';
import { addDays, localParts, minutesBetween, toInstant } from '../time/helsinki';
import type { Assignment, Violation } from './types';

export interface ShiftRow {
  shift: Pick<Shift, 'id' | 'type' | 'startsAt' | 'endsAt'> & { requiredHeadcount?: number };
  people: Assignment['employee'][];
  violations: Violation[];
}

export interface DayGroup {
  date: string;
  rows: ShiftRow[];
}

/**
 * The shifts of a schedule grouped by local start date. Every shift of the department inside the period is shown,
 * staffed or not, so a gap is visible. Shifts that only an assignment refers to are added too, so nothing assigned
 * disappears from the view even if its shift was moved out of the period.
 */
export function groupByDay(
  periodStart: string,
  periodEnd: string,
  shifts: readonly ShiftRow['shift'][],
  assignments: readonly Assignment[],
  violations: readonly Violation[] = []
): DayGroup[] {
  const from = toInstant(periodStart, '00:00')!;
  const to = toInstant(addDays(periodEnd, 1), '00:00')!;
  const byId = new Map<number, ShiftRow['shift']>();
  for (const shift of shifts) {
    if (new Date(shift.startsAt) >= from && new Date(shift.endsAt) <= to) byId.set(shift.id, shift);
  }
  for (const assignment of assignments) if (!byId.has(assignment.shiftId)) byId.set(assignment.shiftId, assignment.shift);

  const groups = new Map<string, ShiftRow[]>();
  const ordered = [...byId.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id);
  for (const shift of ordered) {
    const date = localParts(new Date(shift.startsAt)).date;
    const people = assignments
      .filter((a) => a.shiftId === shift.id)
      .map((a) => a.employee)
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    const row = { shift, people, violations: violations.filter((v) => v.shiftId === shift.id) };
    groups.set(date, [...(groups.get(date) ?? []), row]);
  }
  return [...groups.entries()].map(([date, rows]) => ({ date, rows }));
}

export interface EmployeeLoad {
  employee: Assignment['employee'];
  shifts: number;
  minutes: number;
  nights: number;
}

/** Shifts, real hours and nights per employee, most hours first, to see how evenly the work is spread. */
export function loadByEmployee(assignments: readonly Assignment[]): EmployeeLoad[] {
  const loads = new Map<number, EmployeeLoad>();
  for (const a of assignments) {
    const load = loads.get(a.employeeId) ?? { employee: a.employee, shifts: 0, minutes: 0, nights: 0 };
    load.shifts++;
    load.minutes += minutesBetween(new Date(a.shift.startsAt), new Date(a.shift.endsAt));
    if (a.shift.type === 'NIGHT') load.nights++;
    loads.set(a.employeeId, load);
  }
  return [...loads.values()].sort(
    (a, b) => b.minutes - a.minutes || a.employee.lastName.localeCompare(b.employee.lastName) || a.employee.id - b.employee.id
  );
}
