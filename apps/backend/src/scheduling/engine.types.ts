// Input and output of the scheduling engine. The engine is a pure function of this input:
// no HTTP, no database, no clock. See docs/scheduling-engine.md for the rules and the algorithm.

export type HardRuleId = 'BR-H01' | 'BR-H02' | 'BR-H03' | 'BR-H04' | 'BR-H05' | 'BR-H06' | 'BR-H07' | 'BR-T03';

export interface RuleConfig {
  /** Minimum rest between the end of one shift and the start of the next, in real minutes (BR-H05). */
  minRestMinutes: number;
  /** Maximum worked minutes in one Monday to Sunday week of the planning time zone (BR-H04). */
  maxWeeklyMinutes: number;
  /** IANA time zone that defines calendar days and weeks (BR-T01). */
  timeZone: string;
}

export const DEFAULT_RULES: RuleConfig = {
  minRestMinutes: 11 * 60,
  maxWeeklyMinutes: 40 * 60,
  timeZone: 'Europe/Helsinki'
};

/** A local calendar date in the planning time zone, written YYYY-MM-DD. */
export type LocalDate = string;

export interface EngineQualification {
  qualificationId: number;
  /** Last local date on which the qualification is valid, or null when it never expires (BR-H01). */
  validUntil: LocalDate | null;
}

export interface EngineEmployee {
  id: number;
  active: boolean;
  contractMinutesPerWeek: number;
  qualifications: EngineQualification[];
}

export type AvailabilityKind = 'AVAILABLE' | 'UNAVAILABLE' | 'LEAVE';

export interface EngineAvailability {
  employeeId: number;
  startsAt: Date;
  endsAt: Date;
  type: AvailabilityKind;
}

export interface EngineShiftRequirement {
  qualificationId: number;
  count: number;
}

export type ShiftKind = 'MORNING' | 'EVENING' | 'NIGHT';

export interface EngineShift {
  id: number;
  type: ShiftKind;
  startsAt: Date;
  endsAt: Date;
  requiredHeadcount: number;
  requirements: EngineShiftRequirement[];
}

export interface EngineAssignment {
  shiftId: number;
  employeeId: number;
}

/**
 * Time an employee already works outside the schedule being planned, for example the last days of the
 * previous period. It is never changed, but it counts for overlap, rest and weekly hours (BR-H03 to BR-H05).
 */
export interface BusyInterval {
  employeeId: number;
  startsAt: Date;
  endsAt: Date;
}

export interface PlanningPeriod {
  /** First local date of the period. */
  start: LocalDate;
  /** Last local date of the period, included. */
  end: LocalDate;
}

export interface EngineInput {
  period: PlanningPeriod;
  /** Shifts of one department to staff in this period. */
  shifts: EngineShift[];
  /** Candidates: the employees of the same department. */
  employees: EngineEmployee[];
  availability: EngineAvailability[];
  /** Assignments a planner made by hand. The engine keeps them and plans around them. */
  lockedAssignments: EngineAssignment[];
  /** Work outside this schedule that still counts for the rules. */
  busy: BusyInterval[];
  rules: RuleConfig;
}

export interface Violation {
  ruleId: HardRuleId;
  shiftId: number;
  /** Missing for a violation of the shift itself, such as missing headcount (BR-H06). */
  employeeId?: number;
  message: string;
}

export interface EngineResult {
  /** Locked assignments plus the ones the engine added. */
  assignments: EngineAssignment[];
  /** Every hard rule that the result still breaks. An empty list means the schedule can be approved (BR-W03). */
  violations: Violation[];
}
