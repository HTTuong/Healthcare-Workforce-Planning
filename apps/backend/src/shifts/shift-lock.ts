import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { dateText, periodBounds } from '../schedules/schedule-input.loader.js';
import { isEditable, SCHEDULE_STATUSES, type ScheduleStatus } from '../schedules/schedule-workflow.js';
import { addDays } from '../scheduling/local-time.js';

/** Where a shift is, or would be after a change. A new shift has no id yet. */
export interface ShiftPlace {
  id?: number;
  departmentId: number;
  startsAt: Date;
  endsAt: Date;
}

const LOCKED = SCHEDULE_STATUSES.filter((status) => !isEditable(status));

type Db = Pick<PrismaService, 'schedule'>;

/** The schedules in these statuses that show the shift at this place, as ScheduleInputLoader reads them. */
async function schedulesShowing(prisma: Db, place: ShiftPlace, statuses: readonly ScheduleStatus[]) {
  // A local date in Helsinki is the UTC date or the day after, so one day of margin finds every candidate.
  const candidates = await prisma.schedule.findMany({
    where: {
      status: { in: [...statuses] },
      OR: [
        ...(place.id === undefined ? [] : [{ assignments: { some: { shiftId: place.id } } }]),
        {
          departmentId: place.departmentId,
          periodStart: { lte: new Date(`${addDays(dateText(place.endsAt), 1)}T00:00:00Z`) },
          periodEnd: { gte: new Date(`${addDays(dateText(place.startsAt), -1)}T00:00:00Z`) }
        }
      ]
    },
    select: {
      id: true,
      status: true,
      departmentId: true,
      periodStart: true,
      periodEnd: true,
      assignments: { where: { shiftId: place.id ?? -1 }, select: { id: true } }
    },
    orderBy: { id: 'asc' }
  });
  return candidates.filter((schedule) => {
    if (schedule.assignments.length > 0) return true;
    const { from, to } = periodBounds(dateText(schedule.periodStart), dateText(schedule.periodEnd));
    return schedule.departmentId === place.departmentId && place.startsAt >= from && place.endsAt <= to;
  });
}

/**
 * BR-W01 and BR-W02 for shifts (R-WF-02). A schedule shows the shifts of its department inside its period (BR-T03) and
 * the shifts it has assignments for. Changing such a shift changes the schedule, so it is refused while the schedule is
 * in REVIEW, APPROVED or PUBLISHED: otherwise a planner could change a schedule after the manager approved it (BR-W03)
 * or after employees saw it.
 * Each place is checked as it is now and, for a change, as it would be after it, so a shift cannot be moved into or
 * out of a locked period either.
 */
export async function assertNoLockedSchedule(prisma: Db, places: ShiftPlace[]): Promise<void> {
  for (const place of places) {
    const [locked] = await schedulesShowing(prisma, place, LOCKED);
    if (locked) {
      const what = place.id === undefined ? 'A shift at this time' : `Shift ${place.id}`;
      throw new ConflictException(
        `${what} is part of schedule ${locked.id}, which is ${locked.status}. Only DRAFT and OPTIMIZED schedules can change (BR-W01)`
      );
    }
  }
}

/**
 * After a shift changed, an OPTIMIZED schedule that shows it no longer matches what the engine made, so it goes back
 * to DRAFT, as after a hand edit (BR-W01, F-12). The planner can then generate it again.
 */
export async function reopenOptimized(prisma: Db, places: ShiftPlace[]): Promise<void> {
  const ids = new Set<number>();
  for (const place of places) {
    for (const schedule of await schedulesShowing(prisma, place, ['OPTIMIZED'])) ids.add(schedule.id);
  }
  if (ids.size === 0) return;
  await prisma.schedule.updateMany({ where: { id: { in: [...ids] }, status: 'OPTIMIZED' }, data: { status: 'DRAFT' } });
}
