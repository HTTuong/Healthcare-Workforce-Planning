import type { EngineAssignment, EngineAvailability, EngineEmployee, EngineInput, EngineShift } from './engine.types.js';
import { isoWeekday, localDateOf, minutesBetween, nextWeekStart, weekStartOf } from './local-time.js';

// Soft constraint scores (BR-S01 to BR-S04, see docs/business-rules.md). Each score runs from 0 to 100, where 100 is
// the best possible. They are measured, never enforced: a low score does not block approval, a hard violation does.

export interface SoftScores {
  /** BR-S01: share of assignments inside time the employee marked AVAILABLE. */
  preference: number;
  /** BR-S02: how evenly night and weekend shifts are spread, relative to contract hours. */
  fairness: number;
  /** BR-S03: how evenly the assigned minutes are spread, relative to contract hours. */
  workload: number;
}

export interface QualityReport extends SoftScores {
  /** BR-S04: share of the assigned minutes that are not overtime. */
  overtime: number;
  /** Weighted average of the four scores, 0 to 100. */
  quality: number;
}

export type QualityWeights = Readonly<Omit<QualityReport, 'quality'>>;

/**
 * Weights of the quality score (day 18/11). Overtime weighs most because it costs money and wears staff out.
 * Preference and fairness come next and are equal, and workload weighs least because overtime and fairness already
 * cover part of it. A design assumption to confirm with the product owner, recorded in docs/business-rules.md.
 */
export const QUALITY_WEIGHTS: QualityWeights = { overtime: 0.3, preference: 0.25, fairness: 0.25, workload: 0.2 };

/**
 * Gini coefficient: 0 when all values are equal, close to 1 when one value holds everything.
 * Mean absolute difference between every pair, divided by twice the mean. All zeros count as equal.
 */
export function gini(values: readonly number[]): number {
  // Sorted first, so the floating point sums do not depend on the order of the employees. Without this, two equal
  // candidates differed by 1e-16 and the input order decided which one the ranking picked.
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (n < 2 || total === 0) return 0;
  let differences = 0;
  for (const a of sorted) for (const b of sorted) differences += Math.abs(a - b);
  return differences / (2 * n * total);
}

/** Night shifts and shifts that start on a local Saturday or Sunday are the unpopular ones (BR-S02). */
export function isUnpopular(shift: EngineShift, timeZone: string): boolean {
  return shift.type === 'NIGHT' || isoWeekday(localDateOf(shift.startsAt, timeZone)) >= 6;
}

/**
 * Facts about the input that every score needs, built once per input object. The ranking computes the scores for
 * every candidate, so they must not repeat lookups or time zone conversions. The input must not change during a run.
 */
interface ScoreIndex {
  shifts: Map<number, EngineShift>;
  minutes: Map<number, number>;
  unpopular: Map<number, boolean>;
  /** Minutes of each shift in each local week it touches, keyed by the Monday's date. */
  weekMinutes: Map<number, Map<string, number>>;
  preferred: Map<number, EngineAvailability[]>;
  /** Minutes of busy time per employee and week, which count for overtime. */
  busyWeekMinutes: Map<number, Map<string, number>>;
  /** Active employees with contract hours, the ones compared for fairness and workload. */
  compared: EngineEmployee[];
}

const indexes = new WeakMap<EngineInput, ScoreIndex>();

function addTo(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function minutesPerWeek(startsAt: Date, endsAt: Date, timeZone: string): Map<string, number> {
  const weeks = new Map<string, number>();
  for (let weekStart = weekStartOf(startsAt, timeZone); weekStart < endsAt; ) {
    const weekEnd = nextWeekStart(weekStart, timeZone);
    const from = Math.max(startsAt.getTime(), weekStart.getTime());
    const to = Math.min(endsAt.getTime(), weekEnd.getTime());
    if (to > from) addTo(weeks, localDateOf(weekStart, timeZone), (to - from) / 60_000);
    weekStart = weekEnd;
  }
  return weeks;
}

function indexOf(input: EngineInput): ScoreIndex {
  let index = indexes.get(input);
  if (!index) {
    const { timeZone } = input.rules;
    const busyWeekMinutes = new Map<number, Map<string, number>>();
    for (const interval of input.busy) {
      const weeks = busyWeekMinutes.get(interval.employeeId) ?? new Map<string, number>();
      for (const [week, minutes] of minutesPerWeek(interval.startsAt, interval.endsAt, timeZone)) addTo(weeks, week, minutes);
      busyWeekMinutes.set(interval.employeeId, weeks);
    }
    const preferred = new Map<number, EngineAvailability[]>();
    for (const record of input.availability) {
      if (record.type === 'AVAILABLE') preferred.set(record.employeeId, [...(preferred.get(record.employeeId) ?? []), record]);
    }
    index = {
      shifts: new Map(input.shifts.map((shift) => [shift.id, shift])),
      minutes: new Map(input.shifts.map((shift) => [shift.id, minutesBetween(shift.startsAt, shift.endsAt)])),
      unpopular: new Map(input.shifts.map((shift) => [shift.id, isUnpopular(shift, timeZone)])),
      weekMinutes: new Map(input.shifts.map((shift) => [shift.id, minutesPerWeek(shift.startsAt, shift.endsAt, timeZone)])),
      preferred,
      busyWeekMinutes,
      compared: input.employees.filter((employee) => employee.active && employee.contractMinutesPerWeek > 0)
    };
    indexes.set(input, index);
  }
  return index;
}

/** The shifts of each employee in the schedule, skipping assignments to unknown shifts. */
function shiftsByEmployee(index: ScoreIndex, assignments: readonly EngineAssignment[]): Map<number, EngineShift[]> {
  const byEmployee = new Map<number, EngineShift[]>();
  for (const assignment of assignments) {
    const shift = index.shifts.get(assignment.shiftId);
    if (!shift) continue;
    const own = byEmployee.get(assignment.employeeId);
    if (own) own.push(shift);
    else byEmployee.set(assignment.employeeId, [shift]);
  }
  return byEmployee;
}

/** Turns an inequality into a score: 100 for a perfectly even spread. */
function evenness(values: readonly number[]): number {
  return 100 * (1 - gini(values));
}

function preferenceFrom(index: ScoreIndex, byEmployee: Map<number, EngineShift[]>): number {
  let matched = 0;
  let counted = 0;
  for (const [employeeId, shifts] of byEmployee) {
    const preferred = index.preferred.get(employeeId);
    if (!preferred) continue;
    for (const shift of shifts) {
      counted++;
      if (preferred.some((record) => record.startsAt <= shift.startsAt && record.endsAt >= shift.endsAt)) matched++;
    }
  }
  return counted === 0 ? 100 : (100 * matched) / counted;
}

function fairnessFrom(index: ScoreIndex, byEmployee: Map<number, EngineShift[]>): number {
  return evenness(
    index.compared.map(
      (employee) =>
        (byEmployee.get(employee.id) ?? []).filter((shift) => index.unpopular.get(shift.id)).length /
        employee.contractMinutesPerWeek
    )
  );
}

function workloadFrom(index: ScoreIndex, byEmployee: Map<number, EngineShift[]>): number {
  return evenness(
    index.compared.map(
      (employee) =>
        (byEmployee.get(employee.id) ?? []).reduce((sum, shift) => sum + index.minutes.get(shift.id)!, 0) /
        employee.contractMinutesPerWeek
    )
  );
}

/**
 * BR-S04. For every employee with contract hours and every local week, the minutes the schedule adds above the
 * contract. Busy time outside the schedule fills the week first, so overtime it causes on its own is not counted.
 * The score is the share of all assigned minutes that are not overtime, and 100 when nothing is assigned.
 */
function overtimeFrom(input: EngineInput, index: ScoreIndex, byEmployee: Map<number, EngineShift[]>): number {
  let assigned = 0;
  let overtime = 0;
  for (const [employeeId, shifts] of byEmployee) {
    const weeks = new Map<string, number>();
    for (const shift of shifts) {
      // shiftsByEmployee only returns shifts of the input, and the index has an entry for each of them.
      assigned += index.minutes.get(shift.id)!;
      for (const [week, minutes] of index.weekMinutes.get(shift.id)!) addTo(weeks, week, minutes);
    }
    const contract = input.employees.find((employee) => employee.id === employeeId)?.contractMinutesPerWeek ?? 0;
    if (contract <= 0) continue;
    const busy = index.busyWeekMinutes.get(employeeId);
    for (const [week, minutes] of weeks) {
      const before = busy?.get(week) ?? 0;
      overtime += Math.max(0, before + minutes - Math.max(contract, before));
    }
  }
  return assigned === 0 ? 100 : 100 * (1 - overtime / assigned);
}

export function preferenceScore(input: EngineInput, assignments: readonly EngineAssignment[]): number {
  const index = indexOf(input);
  return preferenceFrom(index, shiftsByEmployee(index, assignments));
}

export function fairnessScore(input: EngineInput, assignments: readonly EngineAssignment[]): number {
  const index = indexOf(input);
  return fairnessFrom(index, shiftsByEmployee(index, assignments));
}

export function workloadScore(input: EngineInput, assignments: readonly EngineAssignment[]): number {
  const index = indexOf(input);
  return workloadFrom(index, shiftsByEmployee(index, assignments));
}

export function overtimeScore(input: EngineInput, assignments: readonly EngineAssignment[]): number {
  const index = indexOf(input);
  return overtimeFrom(input, index, shiftsByEmployee(index, assignments));
}

export function softScores(input: EngineInput, assignments: readonly EngineAssignment[]): SoftScores {
  const index = indexOf(input);
  const byEmployee = shiftsByEmployee(index, assignments);
  return {
    preference: preferenceFrom(index, byEmployee),
    fairness: fairnessFrom(index, byEmployee),
    workload: workloadFrom(index, byEmployee)
  };
}

/** The four scores and their weighted average (the schedule quality score). */
export function qualityReport(input: EngineInput, assignments: readonly EngineAssignment[]): QualityReport {
  const index = indexOf(input);
  const scores = { ...softScores(input, assignments), overtime: overtimeFrom(input, index, shiftsByEmployee(index, assignments)) };
  const quality =
    QUALITY_WEIGHTS.preference * scores.preference +
    QUALITY_WEIGHTS.fairness * scores.fairness +
    QUALITY_WEIGHTS.workload * scores.workload +
    QUALITY_WEIGHTS.overtime * scores.overtime;
  return { ...scores, quality };
}
