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

/** A small seeded random number generator (mulberry32), so a failing random case can be repeated from its seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const SLOTS = { MORNING: ['07:00', '15:00', 0], EVENING: ['15:00', '23:00', 0], NIGHT: ['23:00', '07:00', 1] } as const;
const KINDS = ['MORNING', 'EVENING', 'NIGHT'] as const;
const day = (offset: number) => `2026-11-${String(2 + offset).padStart(2, '0')}`;

/**
 * A random but repeatable input for two weeks of November 2026 (no daylight saving change): 4 to 12 shifts,
 * 3 to 6 employees, two qualifications, some expiry dates, leave, inactive employees and busy time.
 */
export function randomInput(seed: number, sizes: { shifts?: number; employees?: number } = {}): EngineInput {
  const random = seededRandom(seed);
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const shifts: EngineShift[] = Array.from({ length: sizes.shifts ?? int(4, 12) }, (_, index) => {
    const type = KINDS[int(0, 2)]!;
    const [from, to, nextDay] = SLOTS[type];
    const start = int(0, 13);
    const requirements = [1, 2].filter(() => random() < 0.35).map((qualificationId) => ({ qualificationId, count: 1 }));
    return shift(index + 1, `${day(start)}T${from}:00+02:00`, `${day(start + nextDay)}T${to}:00+02:00`, {
      type,
      requiredHeadcount: Math.max(requirements.length, int(1, 2)),
      requirements
    });
  });
  const employees: EngineEmployee[] = Array.from({ length: sizes.employees ?? int(3, 6) }, (_, index) =>
    employee(index + 1, {
      active: random() < 0.9,
      qualifications: [1, 2]
        .filter(() => random() < 0.5)
        .map((qualificationId) => ({ qualificationId, validUntil: random() < 0.3 ? day(int(0, 13)) : null }))
    })
  );
  const availability = employees.flatMap((person) =>
    Array.from({ length: int(0, 2) }, () => {
      const start = int(0, 13);
      return {
        employeeId: person.id,
        type: (['LEAVE', 'UNAVAILABLE', 'AVAILABLE'] as const)[int(0, 2)]!,
        startsAt: new Date(`${day(start)}T00:00:00+02:00`),
        endsAt: new Date(`${day(start + 1)}T00:00:00+02:00`)
      };
    })
  );
  const busy = employees
    .filter(() => random() < 0.2)
    .map((person) => ({ employeeId: person.id, startsAt: new Date('2026-11-01T23:00:00+02:00'), endsAt: new Date('2026-11-02T07:00:00+02:00') }));
  return engineInput({ period: { start: day(0), end: day(13) }, shifts, employees, availability, busy });
}
