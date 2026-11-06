import type { Assignment, Availability, Employee, Shift } from '../api/types';
import { workByEmployee, weekMinutes } from './hard-rules';

// An independent reading of the soft constraints in docs/business-rules.md (BR-S01 to BR-S04) and the quality score,
// so a test can check the scores the API reports without reusing the engine's code.

export const WEIGHTS = { overtime: 0.3, preference: 0.25, fairness: 0.25, workload: 0.2 } as const;

export interface Scores {
  preference: number;
  fairness: number;
  workload: number;
  overtime: number;
  quality: number;
}

const ms = (iso: string) => Date.parse(iso);
const minutesOf = (shift: Shift) => (ms(shift.endsAt) - ms(shift.startsAt)) / 60_000;

/** 0 when all values are equal: the mean absolute difference of all pairs over twice the mean. */
export function gini(values: number[]): number {
  const total = values.reduce((a, b) => a + b, 0);
  if (values.length < 2 || total === 0) return 0;
  let sum = 0;
  for (const a of values) for (const b of values) sum += Math.abs(a - b);
  return sum / (2 * values.length * total);
}

/** Night shifts and shifts that start on a Saturday or Sunday in Helsinki. */
export function unpopular(shift: Shift): boolean {
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', weekday: 'short' }).format(new Date(shift.startsAt));
  return shift.type === 'NIGHT' || weekday === 'Sat' || weekday === 'Sun';
}

/**
 * The scores of one schedule. `employees` are the people the schedule compares: the ward's employees (inactive ones
 * and those without contract hours are left out here, as the rules say). Busy time outside the schedule is not
 * modelled: the tests that use this have none. All shifts lie in the week that starts on `monday`.
 */
export function scores(input: { employees: Employee[]; shifts: Shift[]; assignments: Assignment[]; availability: Availability[]; monday: string }): Scores {
  const shiftById = new Map(input.shifts.map((s) => [s.id, s]));
  const mine = (employeeId: number) => input.assignments.filter((a) => a.employeeId === employeeId).map((a) => shiftById.get(a.shiftId)!);

  // BR-S01: only people who marked some AVAILABLE time count.
  let counted = 0;
  let matched = 0;
  for (const employee of input.employees) {
    const preferred = input.availability.filter((a) => a.employeeId === employee.id && a.type === 'AVAILABLE');
    if (preferred.length === 0) continue;
    for (const shift of mine(employee.id)) {
      counted++;
      if (preferred.some((p) => ms(p.startsAt) <= ms(shift.startsAt) && ms(p.endsAt) >= ms(shift.endsAt))) matched++;
    }
  }
  const preference = counted === 0 ? 100 : (100 * matched) / counted;

  const compared = input.employees.filter((e) => e.active && e.contractMinutesPerWeek > 0);
  const fairness = 100 * (1 - gini(compared.map((e) => mine(e.id).filter(unpopular).length / e.contractMinutesPerWeek)));
  const workload = 100 * (1 - gini(compared.map((e) => mine(e.id).reduce((sum, s) => sum + minutesOf(s), 0) / e.contractMinutesPerWeek)));

  // BR-S04: minutes above the contract in the week, over all assigned minutes.
  const perWeek = weekMinutes(workByEmployee(input.shifts, input.assignments), input.monday);
  const assigned = input.assignments.reduce((sum, a) => sum + minutesOf(shiftById.get(a.shiftId)!), 0);
  let overtime = 0;
  for (const employee of input.employees) {
    if (employee.contractMinutesPerWeek <= 0) continue;
    overtime += Math.max(0, (perWeek.get(employee.id) ?? 0) - employee.contractMinutesPerWeek);
  }
  const overtimeScore = assigned === 0 ? 100 : 100 * (1 - overtime / assigned);

  const quality = WEIGHTS.preference * preference + WEIGHTS.fairness * fairness + WEIGHTS.workload * workload + WEIGHTS.overtime * overtimeScore;
  return { preference, fairness, workload, overtime: overtimeScore, quality };
}
