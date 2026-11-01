import type { EngineAssignment, EngineEmployee, EngineInput, EngineResult, EngineShift } from './engine.types.js';
import { checkCandidate, hasValidQualification, shiftInPeriod, validateSchedule } from './hard-constraints.js';
import { qualityReport } from './soft-scores.js';

// Priority based, multi pass assignment (docs/scheduling-engine.md).
// This is a greedy heuristic, not a constraint solver. That is a deliberate engineering decision: every assignment can
// be explained by a rule, the code stays small enough to test fully, and the same input always gives the same result.
// The cost is that it can miss a valid schedule that a solver would find. The result then shows BR-H06 violations.

/** Plans one department for one period. Locked assignments are kept, and nothing ever breaks a hard rule to fill a gap. */
export function schedule(input: EngineInput): EngineResult {
  const plan: EngineAssignment[] = [...input.lockedAssignments];
  const shifts = orderShifts(input, plan);

  // Pass 1: the qualification requirements, always on the requirement with the least room to spare.
  fillRequirements(input, plan, shifts);
  // Pass 2: the remaining places, always on the shift with the least room to spare.
  fillHeadcount(input, plan, shifts);
  // Pass 3: report what the schedule still breaks. The validation does not trust the passes above.
  return { assignments: sortAssignments(plan), violations: validateSchedule(input, plan) };
}

function byId<T extends { id: number }>(a: T, b: T): number {
  return a.id - b.id;
}

function staffOf(plan: readonly EngineAssignment[], shiftId: number): number[] {
  return plan.filter((assignment) => assignment.shiftId === shiftId).map((assignment) => assignment.employeeId);
}

function passes(input: EngineInput, plan: readonly EngineAssignment[], shift: EngineShift, employee: EngineEmployee, qualificationIds: number[]) {
  return checkCandidate(input, plan, shift.id, employee.id, qualificationIds).length === 0;
}

/**
 * Hardest first: shifts with requirements, then the fewest employees who can fill the scarcest requirement,
 * then night shifts, then start time, then id. Shifts outside the period are not staffed (BR-T03).
 */
function orderShifts(input: EngineInput, plan: readonly EngineAssignment[]): EngineShift[] {
  const scarcity = new Map<number, number>();
  for (const shift of input.shifts) {
    const counts = shift.requirements.map(
      (requirement) =>
        input.employees.filter((employee) => passes(input, plan, shift, employee, [requirement.qualificationId])).length
    );
    scarcity.set(shift.id, counts.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...counts));
  }
  return input.shifts
    .filter((shift) => shiftInPeriod(input, shift))
    .sort(
      (a, b) =>
        Number(b.requirements.length > 0) - Number(a.requirements.length > 0) ||
        // Every shift of the input has an entry, so the lookups below always find one.
        scarcity.get(a.id)! - scarcity.get(b.id)! ||
        Number(b.type === 'NIGHT') - Number(a.type === 'NIGHT') ||
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.id - b.id
    );
}

/** Requirements of the shift that its current staff does not cover yet. */
function unmetRequirements(input: EngineInput, plan: readonly EngineAssignment[], shift: EngineShift): number[] {
  const staff = staffOf(plan, shift.id).map((id) => input.employees.find((employee) => employee.id === id));
  return shift.requirements
    .filter((requirement) => {
      const covered = staff.filter(
        (employee) =>
          employee !== undefined &&
          hasValidQualification(employee, requirement.qualificationId, shift, input.rules.timeZone)
      ).length;
      return covered < requirement.count;
    })
    .map((requirement) => requirement.qualificationId);
}

interface Need {
  shift: EngineShift;
  qualificationId: number;
  count: number;
}

function missing(input: EngineInput, plan: readonly EngineAssignment[], need: Need): number {
  const staff = staffOf(plan, need.shift.id).map((id) => input.employees.find((employee) => employee.id === id));
  const covered = staff.filter(
    (employee) =>
      employee !== undefined && hasValidQualification(employee, need.qualificationId, need.shift, input.rules.timeZone)
  ).length;
  return Math.max(0, need.count - covered);
}

/**
 * Fills one qualified place at a time, always for the requirement with the least slack: qualified candidates minus
 * missing people. Counting the candidates once at the start was not enough: when another shift took the only
 * candidate for one requirement, a shift that looked as easy kept taking the person that requirement needed.
 */
function fillRequirements(input: EngineInput, plan: EngineAssignment[], ordered: readonly EngineShift[]) {
  const isOpen = (need: Need) =>
    staffOf(plan, need.shift.id).length < need.shift.requiredHeadcount && missing(input, plan, need) > 0;
  let needs: Need[] = ordered
    .flatMap((shift) =>
      [...shift.requirements]
        .sort((a, b) => a.qualificationId - b.qualificationId)
        .map((requirement) => ({ shift, qualificationId: requirement.qualificationId, count: requirement.count }))
    )
    .filter(isOpen);
  while (needs.length > 0) {
    let chosen: { need: Need; candidates: EngineEmployee[]; slack: number } | undefined;
    for (const need of needs) {
      const staff = staffOf(plan, need.shift.id);
      const candidates = input.employees.filter(
        (employee) => !staff.includes(employee.id) && passes(input, plan, need.shift, employee, [need.qualificationId])
      );
      const slack = candidates.length - missing(input, plan, need);
      // The earlier need in the hardest first order wins a tie, so the result stays the same on every run.
      if (!chosen || slack < chosen.slack) chosen = { need, candidates, slack };
    }
    const { need, candidates } = chosen!;
    const best = rankCandidates(input, plan, need.shift, candidates, unmetRequirements(input, plan, need.shift))[0];
    if (best) plan.push({ shiftId: need.shift.id, employeeId: best.id });
    // A requirement with no candidate left stays short and is reported by the validation.
    needs = needs.filter((candidate) => isOpen(candidate) && !(candidate === need && !best));
  }
}

/**
 * Fills one place at a time, always on the open shift with the least slack: candidates minus open places.
 * A fixed order (night shifts first) gave a night shift a person that a two person morning shift needed more,
 * and left the morning shift short although a complete schedule existed (see engine.spec.ts).
 */
function fillHeadcount(input: EngineInput, plan: EngineAssignment[], ordered: readonly EngineShift[]) {
  let open = ordered.filter((shift) => staffOf(plan, shift.id).length < shift.requiredHeadcount);
  while (open.length > 0) {
    let chosen: { shift: EngineShift; candidates: EngineEmployee[]; slack: number } | undefined;
    for (const shift of open) {
      const staff = staffOf(plan, shift.id);
      const candidates = input.employees.filter(
        (employee) => !staff.includes(employee.id) && passes(input, plan, shift, employee, [])
      );
      const slack = candidates.length - (shift.requiredHeadcount - staff.length);
      // The earlier shift in the hardest first order wins a tie, so the result stays the same on every run.
      if (!chosen || slack < chosen.slack) chosen = { shift, candidates, slack };
    }
    const { shift, candidates } = chosen!;
    const best = rankCandidates(input, plan, shift, candidates, unmetRequirements(input, plan, shift))[0];
    if (best) plan.push({ shiftId: shift.id, employeeId: best.id });
    // A shift with no candidate left stays short and is reported by the validation.
    open = open.filter(
      (candidate) =>
        staffOf(plan, candidate.id).length < candidate.requiredHeadcount && !(candidate === shift && !best)
    );
  }
}

/**
 * Orders the candidates who already passed the hard checks:
 * 1. the most open requirements of the shift covered, because one person covering two keeps a place free;
 * 2. the highest schedule quality score after the assignment (BR-S01 to BR-S04, weights in soft-scores.ts);
 * 3. a matching AVAILABLE record (BR-S01), because the preference score leaves out employees who never stated one,
 *    so it cannot tell a match from a neutral choice;
 * 4. the lowest id, so the result is the same on every run.
 */
export function rankCandidates(
  input: EngineInput,
  plan: readonly EngineAssignment[],
  shift: EngineShift,
  candidates: readonly EngineEmployee[],
  unmetQualificationIds: readonly number[]
): EngineEmployee[] {
  const { timeZone } = input.rules;
  const keys = new Map(
    candidates.map((employee) => [
      employee.id,
      {
        covers: unmetQualificationIds.filter((id) => hasValidQualification(employee, id, shift, timeZone)).length,
        quality: qualityReport(input, [...plan, { shiftId: shift.id, employeeId: employee.id }]).quality,
        prefers: input.availability.some(
          (record) =>
            record.employeeId === employee.id &&
            record.type === 'AVAILABLE' &&
            record.startsAt <= shift.startsAt &&
            record.endsAt >= shift.endsAt
        )
          ? 0
          : 1
      }
    ])
  );
  return [...candidates].sort((a, b) => {
    const ka = keys.get(a.id)!;
    const kb = keys.get(b.id)!;
    return kb.covers - ka.covers || kb.quality - ka.quality || ka.prefers - kb.prefers || byId(a, b);
  });
}

function sortAssignments(plan: readonly EngineAssignment[]): EngineAssignment[] {
  return [...plan].sort((a, b) => a.shiftId - b.shiftId || a.employeeId - b.employeeId);
}
