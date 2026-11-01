import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_RULES, type EngineInput, type LocalDate } from '../scheduling/engine.types.js';
import { addDays, startOfLocalDate } from '../scheduling/local-time.js';

/** The database client, or the client of a running transaction. */
export type Db = PrismaService | Prisma.TransactionClient;

export interface ScheduleRef {
  id: number;
  departmentId: number;
  periodStart: Date;
  periodEnd: Date;
}

// Rest (BR-H05) and weekly hours (BR-H04) reach outside the period: a period that starts on a Thursday shares its
// week with the three days before it. Availability and busy time are therefore read for 8 extra days on each side.
const MARGIN_MS = 8 * 24 * 60 * 60 * 1000;

/** A @db.Date column comes back as 00:00 UTC of that calendar date. */
export function dateText(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

/** The instants of the period: from local midnight of the first day to local midnight after the last day. */
export function periodBounds(start: LocalDate, end: LocalDate) {
  const from = startOfLocalDate(start, DEFAULT_RULES.timeZone);
  const to = startOfLocalDate(addDays(end, 1), DEFAULT_RULES.timeZone);
  return { from, to, readFrom: new Date(from.getTime() - MARGIN_MS), readTo: new Date(to.getTime() + MARGIN_MS) };
}

/**
 * Builds the engine input of a schedule from the database (docs/scheduling-engine.md, "Boundaries").
 * - Shifts: the department's shifts that lie inside the period (BR-T03), plus every shift the schedule already
 *   uses, so an assignment to a shift that was moved out of the period is reported instead of lost.
 * - Employees: the department's employees, plus anyone assigned by hand from another department.
 * - Locked: the assignments the schedule already has. The engine keeps them.
 * - Busy: the same employees' shifts in other APPROVED or PUBLISHED schedules. Drafts of other schedules are not
 *   commitments yet, so they do not block anyone. Approval checks again with the data of that moment.
 */
@Injectable()
export class ScheduleInputLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(schedule: ScheduleRef, db: Db = this.prisma): Promise<EngineInput> {
    const period = { start: dateText(schedule.periodStart), end: dateText(schedule.periodEnd) };
    const { from, to, readFrom, readTo } = periodBounds(period.start, period.end);
    const locked = await db.assignment.findMany({
      where: { scheduleId: schedule.id },
      select: { shiftId: true, employeeId: true },
      orderBy: [{ shiftId: 'asc' }, { employeeId: 'asc' }]
    });
    const shifts = await db.shift.findMany({
      where: {
        OR: [
          { departmentId: schedule.departmentId, startsAt: { gte: from }, endsAt: { lte: to } },
          { id: { in: locked.map((assignment) => assignment.shiftId) } }
        ]
      },
      include: { requirements: { select: { qualificationId: true, count: true } } },
      orderBy: { id: 'asc' }
    });
    const employees = await db.employee.findMany({
      where: {
        OR: [{ departmentId: schedule.departmentId }, { id: { in: locked.map((assignment) => assignment.employeeId) } }]
      },
      select: {
        id: true,
        active: true,
        contractMinutesPerWeek: true,
        qualifications: { select: { qualificationId: true, validUntil: true } }
      },
      orderBy: { id: 'asc' }
    });
    const employeeIds = employees.map((employee) => employee.id);
    const availability = await db.availability.findMany({
      where: { employeeId: { in: employeeIds }, startsAt: { lt: readTo }, endsAt: { gt: readFrom } },
      select: { employeeId: true, startsAt: true, endsAt: true, type: true },
      orderBy: [{ employeeId: 'asc' }, { startsAt: 'asc' }]
    });
    const busy = await db.assignment.findMany({
      where: {
        employeeId: { in: employeeIds },
        scheduleId: { not: schedule.id },
        schedule: { status: { in: ['APPROVED', 'PUBLISHED'] } },
        shift: { startsAt: { lt: readTo }, endsAt: { gt: readFrom } }
      },
      select: { employeeId: true, shift: { select: { startsAt: true, endsAt: true } } },
      orderBy: { id: 'asc' }
    });
    return {
      period,
      shifts: shifts.map((shift) => ({
        id: shift.id,
        type: shift.type,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        requiredHeadcount: shift.requiredHeadcount,
        requirements: shift.requirements
      })),
      employees: employees.map((employee) => ({
        id: employee.id,
        active: employee.active,
        contractMinutesPerWeek: employee.contractMinutesPerWeek,
        qualifications: employee.qualifications.map((link) => ({
          qualificationId: link.qualificationId,
          validUntil: link.validUntil === null ? null : dateText(link.validUntil)
        }))
      })),
      availability,
      lockedAssignments: locked,
      busy: busy.map((row) => ({ employeeId: row.employeeId, startsAt: row.shift.startsAt, endsAt: row.shift.endsAt })),
      rules: DEFAULT_RULES
    };
  }
}
