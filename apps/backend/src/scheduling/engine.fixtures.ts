import {
  DEFAULT_RULES,
  type EngineEmployee,
  type EngineInput,
  type EngineShift,
  type Violation
} from './engine.types.js';

// Small builders for engine tests. Times are written with their offset, as a planner in Helsinki would read them.

export function shift(id: number, startsAt: string, endsAt: string, extra: Partial<EngineShift> = {}): EngineShift {
  return { id, type: 'MORNING', startsAt: new Date(startsAt), endsAt: new Date(endsAt), requiredHeadcount: 1, requirements: [], ...extra };
}

export function employee(id: number, extra: Partial<EngineEmployee> = {}): EngineEmployee {
  return { id, active: true, contractMinutesPerWeek: 2295, qualifications: [], ...extra };
}

export function engineInput(extra: Partial<EngineInput> = {}): EngineInput {
  return {
    period: { start: '2026-10-19', end: '2026-11-15' },
    shifts: [],
    employees: [employee(1)],
    availability: [],
    lockedAssignments: [],
    busy: [],
    rules: DEFAULT_RULES,
    ...extra
  };
}

/** The rule ids of a list of violations, which is what most tests compare. */
export function ruleIds(violations: Violation[]): string[] {
  return violations.map((violation) => violation.ruleId);
}
