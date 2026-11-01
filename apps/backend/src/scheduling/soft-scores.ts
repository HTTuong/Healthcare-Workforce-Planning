import type { EngineAssignment, EngineEmployee, EngineInput, EngineShift } from './engine.types.js';
import { isoWeekday, localDateOf, minutesBetween } from './local-time.js';

// Soft constraint scores (BR-S01 to BR-S03, see docs/business-rules.md). Each score runs from 0 to 100, where 100 is
// the best possible. They are measured, never enforced: a low score does not block approval, a hard violation does.

export interface SoftScores {
  /** BR-S01: share of assignments inside time the employee marked AVAILABLE. */
  preference: number;
  /** BR-S02: how evenly night and weekend shifts are spread, relative to contract hours. */
  fairness: number;
  /** BR-S03: how evenly the assigned minutes are spread, relative to contract hours. */
  workload: number;
}

/**
 * Gini coefficient: 0 when all values are equal, close to 1 when one value holds everything.
 * Mean absolute difference between every pair, divided by twice the mean. All zeros count as equal.
 */
export function gini(values: readonly number[]): number {
  const n = values.length;
  const total = values.reduce((sum, value) => sum + value, 0);
  if (n < 2 || total === 0) return 0;
  let differences = 0;
  for (const a of values) for (const b of values) differences += Math.abs(a - b);
  return differences / (2 * n * total);
}

/** Night shifts and shifts that start on a local Saturday or Sunday are the unpopular ones (BR-S02). */
export function isUnpopular(shift: EngineShift, timeZone: string): boolean {
  return shift.type === 'NIGHT' || isoWeekday(localDateOf(shift.startsAt, timeZone)) >= 6;
}

function shiftsOf(input: EngineInput, assignments: readonly EngineAssignment[], employeeId: number): EngineShift[] {
  return assignments
    .filter((assignment) => assignment.employeeId === employeeId)
    .map((assignment) => input.shifts.find((shift) => shift.id === assignment.shiftId))
    .filter((shift): shift is EngineShift => shift !== undefined);
}

/** Employees who take part in the comparison: active, with contract hours to compare against. */
function comparedEmployees(input: EngineInput): EngineEmployee[] {
  return input.employees.filter((employee) => employee.active && employee.contractMinutesPerWeek > 0);
}

/** Turns an inequality into a score: 100 for a perfectly even spread. */
function evenness(values: readonly number[]): number {
  return 100 * (1 - gini(values));
}

/**
 * BR-S01. Only employees who declared some AVAILABLE time take part: for someone who never stated a preference, no
 * assignment can match or miss it. An assignment matches when one AVAILABLE record covers the whole shift.
 * 100 when no assignment of such an employee exists.
 */
export function preferenceScore(input: EngineInput, assignments: readonly EngineAssignment[]): number {
  let matched = 0;
  let counted = 0;
  for (const employee of input.employees) {
    const preferred = input.availability.filter((record) => record.employeeId === employee.id && record.type === 'AVAILABLE');
    if (preferred.length === 0) continue;
    for (const shift of shiftsOf(input, assignments, employee.id)) {
      counted++;
      if (preferred.some((record) => record.startsAt <= shift.startsAt && record.endsAt >= shift.endsAt)) matched++;
    }
  }
  return counted === 0 ? 100 : (100 * matched) / counted;
}

/** BR-S02. Unpopular shifts per contract minute for every compared employee, spread measured with the Gini coefficient. */
export function fairnessScore(input: EngineInput, assignments: readonly EngineAssignment[]): number {
  return evenness(
    comparedEmployees(input).map(
      (employee) =>
        shiftsOf(input, assignments, employee.id).filter((shift) => isUnpopular(shift, input.rules.timeZone)).length /
        employee.contractMinutesPerWeek
    )
  );
}

/** BR-S03. Assigned minutes per contract minute for every compared employee, spread measured with the Gini coefficient. */
export function workloadScore(input: EngineInput, assignments: readonly EngineAssignment[]): number {
  return evenness(
    comparedEmployees(input).map(
      (employee) =>
        shiftsOf(input, assignments, employee.id).reduce((sum, shift) => sum + minutesBetween(shift.startsAt, shift.endsAt), 0) /
        employee.contractMinutesPerWeek
    )
  );
}

export function softScores(input: EngineInput, assignments: readonly EngineAssignment[]): SoftScores {
  return {
    preference: preferenceScore(input, assignments),
    fairness: fairnessScore(input, assignments),
    workload: workloadScore(input, assignments)
  };
}
