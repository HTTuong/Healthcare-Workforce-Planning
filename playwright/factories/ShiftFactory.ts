import type { ApiClient } from '../api/ApiClient';
import type { Department, Qualification, Shift, ShiftType } from '../api/types';
import { addDays, helsinki } from '../utils/helsinki';

/** The usual local hours of each type. A night starts on its date and ends the next morning. */
export const SHIFT_HOURS: Record<ShiftType, { start: string; end: string }> = {
  MORNING: { start: '07:00', end: '15:00' },
  EVENING: { start: '14:30', end: '22:30' },
  NIGHT: { start: '22:00', end: '07:30' }
};

export interface ShiftOptions {
  department: Department;
  /** The local date the shift starts, YYYY-MM-DD. */
  date: string;
  type?: ShiftType;
  start?: string;
  end?: string;
  headcount?: number;
  requires?: Array<{ qualification: Qualification; count: number }>;
}

/** Shifts in Helsinki time, created by a planner as in the product. */
export class ShiftFactory {
  constructor(private readonly planner: ApiClient) {}

  create(options: ShiftOptions): Promise<Shift> {
    const type = options.type ?? 'MORNING';
    const start = options.start ?? SHIFT_HOURS[type].start;
    const end = options.end ?? SHIFT_HOURS[type].end;
    const endDate = end > start ? options.date : addDays(options.date, 1);
    return this.planner.shifts.create({
      departmentId: options.department.id,
      type,
      startsAt: helsinki(options.date, start),
      endsAt: helsinki(endDate, end),
      requiredHeadcount: options.headcount ?? 1,
      requirements: (options.requires ?? []).map((r) => ({ qualificationId: r.qualification.id, count: r.count }))
    });
  }
}
