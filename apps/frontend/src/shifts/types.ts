export type ShiftType = 'MORNING' | 'EVENING' | 'NIGHT';

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  MORNING: 'Morning',
  EVENING: 'Evening',
  NIGHT: 'Night'
};

/** Usual local hours of each type. The form fills them in when a new shift's type changes. */
export const SHIFT_TYPE_HOURS: Record<ShiftType, { start: string; end: string }> = {
  MORNING: { start: '07:00', end: '15:00' },
  EVENING: { start: '14:30', end: '22:30' },
  NIGHT: { start: '22:00', end: '07:30' }
};

export interface Requirement {
  qualificationId: number;
  count: number;
}

/** GET /shifts and GET /shifts/:id */
export interface Shift {
  id: number;
  departmentId: number;
  type: ShiftType;
  startsAt: string;
  endsAt: string;
  requiredHeadcount: number;
  requirements: Requirement[];
}

/** GET /qualifications */
export interface Qualification {
  id: number;
  code: string;
  name: string;
}
