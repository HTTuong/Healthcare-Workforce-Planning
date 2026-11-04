import type { ShiftType } from '../shifts/types';

export type ScheduleStatus = 'DRAFT' | 'OPTIMIZED' | 'REVIEW' | 'APPROVED' | 'PUBLISHED';

export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  DRAFT: 'Draft',
  OPTIMIZED: 'Optimized',
  REVIEW: 'In review',
  APPROVED: 'Approved',
  PUBLISHED: 'Published'
};

/** GET /schedules */
export interface ScheduleSummary {
  id: number;
  departmentId: number;
  periodStart: string;
  periodEnd: string;
  status: ScheduleStatus;
  qualityScore: number | null;
}

export interface Assignment {
  id: number;
  shiftId: number;
  employeeId: number;
  shift: { id: number; type: ShiftType; startsAt: string; endsAt: string };
  employee: { id: number; firstName: string; lastName: string };
}

/** GET /schedules/:id */
export interface ScheduleDetail extends ScheduleSummary {
  assignments: Assignment[];
  actions: string[];
}

export interface Violation {
  ruleId: string;
  shiftId: number;
  employeeId?: number;
  message: string;
}

export interface Scores {
  preference: number;
  fairness: number;
  workload: number;
  overtime: number;
  quality: number;
}

/** GET /schedules/:id/check */
export interface ScheduleCheck {
  violations: Violation[];
  scores: Scores;
}
