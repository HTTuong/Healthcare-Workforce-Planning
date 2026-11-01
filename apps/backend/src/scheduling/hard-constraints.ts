import type {
  EngineAssignment,
  EngineEmployee,
  EngineInput,
  EngineShift,
  HardRuleId,
  Violation
} from './engine.types.js';
import { addDays, localDateOf, minutesBetween, nextWeekStart, startOfLocalDate, weekStartOf } from './local-time.js';

// Hard constraint checks, as defined in docs/scheduling-engine.md. Every interval is half open: [startsAt, endsAt).

interface Interval {
  startsAt: Date;
  endsAt: Date;
  /** Set for an assigned shift, missing for busy time outside the schedule. */
  shiftId?: number;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

function overlapMinutes(a: Interval, b: Interval): number {
  const start = Math.max(a.startsAt.getTime(), b.startsAt.getTime());
  const end = Math.min(a.endsAt.getTime(), b.endsAt.getTime());
  return Math.max(0, (end - start) / 60_000);
}

function describe(interval: Interval): string {
  return interval.shiftId === undefined
    ? `other work from ${interval.startsAt.toISOString()} to ${interval.endsAt.toISOString()}`
    : `shift ${interval.shiftId}`;
}

function findShift(input: EngineInput, shiftId: number): EngineShift {
  const shift = input.shifts.find((candidate) => candidate.id === shiftId);
  if (!shift) throw new Error(`Unknown shift ${shiftId}`);
  return shift;
}

function findEmployee(input: EngineInput, employeeId: number): EngineEmployee {
  const employee = input.employees.find((candidate) => candidate.id === employeeId);
  if (!employee) throw new Error(`Unknown employee ${employeeId}`);
  return employee;
}

/** BR-T03: the shift starts at or after the first local midnight of the period and ends by the midnight after it. */
export function shiftInPeriod(input: EngineInput, shift: EngineShift): boolean {
  const { timeZone } = input.rules;
  const start = startOfLocalDate(input.period.start, timeZone);
  const end = startOfLocalDate(addDays(input.period.end, 1), timeZone);
  return shift.startsAt >= start && shift.endsAt <= end;
}

/** BR-H01: the employee holds the qualification and it is valid for the whole shift. */
export function hasValidQualification(
  employee: EngineEmployee,
  qualificationId: number,
  shift: EngineShift,
  timeZone: string
): boolean {
  const held = employee.qualifications.find((qualification) => qualification.qualificationId === qualificationId);
  if (!held) return false;
  if (held.validUntil === null) return true;
  return shift.endsAt <= startOfLocalDate(addDays(held.validUntil, 1), timeZone);
}

/** The work of one employee that counts for overlap, rest and weekly hours, except the given shift. */
function workOf(input: EngineInput, plan: readonly EngineAssignment[], employeeId: number, exceptShiftId: number): Interval[] {
  const assigned = plan
    .filter((assignment) => assignment.employeeId === employeeId && assignment.shiftId !== exceptShiftId)
    .map((assignment) => {
      const shift = findShift(input, assignment.shiftId);
      return { startsAt: shift.startsAt, endsAt: shift.endsAt, shiftId: shift.id };
    });
  const busy = input.busy
    .filter((interval) => interval.employeeId === employeeId)
    .map((interval) => ({ startsAt: interval.startsAt, endsAt: interval.endsAt }));
  return [...assigned, ...busy];
}

/**
 * Candidate check: can this employee take this shift, given the assignments in the plan?
 * qualificationIds lists the requirements the employee would be counted for (BR-H01).
 * Returns an empty list when the assignment breaks no hard rule.
 */
export function checkCandidate(
  input: EngineInput,
  plan: readonly EngineAssignment[],
  shiftId: number,
  employeeId: number,
  qualificationIds: readonly number[] = []
): Violation[] {
  const shift = findShift(input, shiftId);
  const employee = findEmployee(input, employeeId);
  const { minRestMinutes, maxWeeklyMinutes, timeZone } = input.rules;
  const violations: Violation[] = [];
  const add = (ruleId: HardRuleId, message: string) => violations.push({ ruleId, shiftId, employeeId, message });

  if (!employee.active) add('BR-H07', `Employee ${employeeId} is not active`);

  if (!shiftInPeriod(input, shift)) {
    add('BR-T03', `Shift ${shiftId} is outside the planning period ${input.period.start} to ${input.period.end}`);
  }

  for (const qualificationId of qualificationIds) {
    if (!hasValidQualification(employee, qualificationId, shift, timeZone)) {
      add('BR-H01', `Employee ${employeeId} has no qualification ${qualificationId} valid for the whole shift ${shiftId}`);
    }
  }

  for (const record of input.availability) {
    if (record.employeeId === employeeId && record.type !== 'AVAILABLE' && overlaps(record, shift)) {
      add(
        'BR-H02',
        `Employee ${employeeId} is ${record.type} from ${record.startsAt.toISOString()} to ${record.endsAt.toISOString()}`
      );
    }
  }

  const work = workOf(input, plan, employeeId, shiftId);
  for (const other of work) {
    if (overlaps(other, shift)) {
      add('BR-H03', `Shift ${shiftId} overlaps ${describe(other)} of employee ${employeeId}`);
      continue;
    }
    // Touching intervals do not overlap, so they land here with a rest of 0 minutes.
    const rest =
      other.endsAt <= shift.startsAt
        ? minutesBetween(other.endsAt, shift.startsAt)
        : minutesBetween(shift.endsAt, other.startsAt);
    if (rest < minRestMinutes) {
      add('BR-H05', `Only ${rest} minutes of rest between shift ${shiftId} and ${describe(other)}, ${minRestMinutes} needed`);
    }
  }

  // A shift that crosses Monday 00:00 is split between the two weeks it touches.
  for (let weekStart = weekStartOf(shift.startsAt, timeZone); weekStart < shift.endsAt; ) {
    const weekEnd = nextWeekStart(weekStart, timeZone);
    const week = { startsAt: weekStart, endsAt: weekEnd };
    const minutes = [shift, ...work].reduce((sum, interval) => sum + overlapMinutes(interval, week), 0);
    if (minutes > maxWeeklyMinutes) {
      add(
        'BR-H04',
        `Employee ${employeeId} would work ${minutes} minutes in the week of ${localDateOf(weekStart, timeZone)}, ${maxWeeklyMinutes} allowed`
      );
    }
    weekStart = weekEnd;
  }

  return violations;
}

/**
 * Schedule validation: every hard rule the whole schedule breaks. It does not trust the algorithm and also runs on
 * schedules edited by hand. An assignment does not record which requirement it fills, so a missing or expired
 * qualification shows here as a BR-H06 shortage for that qualification.
 */
export function validateSchedule(input: EngineInput, assignments: readonly EngineAssignment[]): Violation[] {
  const { timeZone } = input.rules;
  const violations: Violation[] = [];

  for (const shift of input.shifts) {
    if (!shiftInPeriod(input, shift)) {
      violations.push({
        ruleId: 'BR-T03',
        shiftId: shift.id,
        message: `Shift ${shift.id} is outside the planning period ${input.period.start} to ${input.period.end}`
      });
    }
  }

  const seen = new Set<string>();
  assignments.forEach((assignment, index) => {
    const key = `${assignment.shiftId}:${assignment.employeeId}`;
    if (seen.has(key)) {
      violations.push({
        ...assignment,
        ruleId: 'BR-H03',
        message: `Employee ${assignment.employeeId} is assigned twice to shift ${assignment.shiftId}`
      });
      return;
    }
    seen.add(key);
    const others = assignments.filter((_, otherIndex) => otherIndex !== index);
    // BR-T03 was reported once per shift above.
    const found = checkCandidate(input, others, assignment.shiftId, assignment.employeeId).filter(
      (violation) => violation.ruleId !== 'BR-T03'
    );
    violations.push(...found);
  });

  for (const shift of input.shifts) {
    if (!shiftInPeriod(input, shift)) continue;
    const staff = [...new Set(assignments.filter((a) => a.shiftId === shift.id).map((a) => a.employeeId))].map(
      (employeeId) => findEmployee(input, employeeId)
    );
    if (staff.length < shift.requiredHeadcount) {
      violations.push({
        ruleId: 'BR-H06',
        shiftId: shift.id,
        message: `Shift ${shift.id} has ${staff.length} of ${shift.requiredHeadcount} required people`
      });
    }
    for (const requirement of shift.requirements) {
      const qualified = staff.filter((employee) =>
        hasValidQualification(employee, requirement.qualificationId, shift, timeZone)
      ).length;
      if (qualified < requirement.count) {
        violations.push({
          ruleId: 'BR-H06',
          shiftId: shift.id,
          message: `Shift ${shift.id} has ${qualified} of ${requirement.count} people with qualification ${requirement.qualificationId} valid for the shift`
        });
      }
    }
  }

  return violations;
}
