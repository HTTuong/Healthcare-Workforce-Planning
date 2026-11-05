// The shapes the API returns, as far as the tests use them.

export type Role = 'ADMIN' | 'PLANNER' | 'MANAGER' | 'EMPLOYEE';
export const ROLES: readonly Role[] = ['ADMIN', 'PLANNER', 'MANAGER', 'EMPLOYEE'];

export interface Profile {
  sub: number;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  departmentId: number | null;
}

export interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  departmentId: number | null;
  contractMinutesPerWeek: number;
  active: boolean;
}

export interface Department {
  id: number;
  code: string;
  name: string;
}

export interface Qualification {
  id: number;
  code: string;
  name: string;
}

export type ShiftType = 'MORNING' | 'EVENING' | 'NIGHT';

export interface Shift {
  id: number;
  departmentId: number;
  type: ShiftType;
  startsAt: string;
  endsAt: string;
  requiredHeadcount: number;
  requirements: Array<{ qualificationId: number; count: number }>;
}

export type AvailabilityType = 'AVAILABLE' | 'UNAVAILABLE' | 'LEAVE';

export interface Availability {
  id: number;
  employeeId: number;
  type: AvailabilityType;
  startsAt: string;
  endsAt: string;
}

export interface Violation {
  ruleId: string;
  shiftId: number;
  employeeId?: number;
  message: string;
}

export interface Assignment {
  id: number;
  shiftId: number;
  employeeId: number;
}

export type ScheduleStatus = 'DRAFT' | 'OPTIMIZED' | 'REVIEW' | 'APPROVED' | 'PUBLISHED';

export interface Schedule {
  id: number;
  departmentId: number;
  periodStart: string;
  periodEnd: string;
  status: ScheduleStatus;
  qualityScore: number | null;
  actions?: string[];
  assignments?: Assignment[];
}

export interface GenerateResult {
  added: number;
  violations: Violation[];
  schedule: Schedule;
}
