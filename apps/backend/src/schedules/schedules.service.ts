import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { isWriteConflict } from '../common/db-errors.js';
import { parseLocalDate, parsePositiveInt } from '../common/parse.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { schedule as runEngine } from '../scheduling/engine.js';
import { validateSchedule } from '../scheduling/hard-constraints.js';
import { addDays } from '../scheduling/local-time.js';
import { qualityReport } from '../scheduling/soft-scores.js';
import { dateText, ScheduleInputLoader } from './schedule-input.loader.js';
import { allowedActions, nextStatus, type ScheduleStatus, WORKFLOW, type WorkflowAction } from './schedule-workflow.js';

/**
 * Longest planning period. It bounds the engine's run time inside one request: 28 days with 30 employees took under
 * a second (docs/scheduling-engine.md). Finnish wards usually plan three to six weeks, so 42 days is the limit.
 */
export const MAX_PERIOD_DAYS = 42;

export interface ScheduleInput {
  departmentId?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
}

export interface AssignmentInput {
  shiftId?: unknown;
  employeeId?: unknown;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
}

/** Days from start to end, both included. */
function daysIn(start: string, end: string): number {
  let days = 1;
  for (let date = start; date < end; date = addDays(date, 1)) days++;
  return days;
}

const CONCURRENT = 'Another change to these schedules happened at the same time. Load the schedule again and retry';

const DETAIL = {
  assignments: {
    orderBy: [{ shiftId: 'asc' as const }, { employeeId: 'asc' as const }],
    include: {
      shift: { select: { id: true, type: true, startsAt: true, endsAt: true } },
      employee: { select: { id: true, firstName: true, lastName: true } }
    }
  }
};

interface ScheduleRow {
  id: number;
  departmentId: number;
  periodStart: Date;
  periodEnd: Date;
  status: ScheduleStatus;
  qualityScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Calendar dates as YYYY-MM-DD instead of midnight UTC timestamps. */
function present<T extends ScheduleRow>(row: T) {
  return { ...row, periodStart: dateText(row.periodStart), periodEnd: dateText(row.periodEnd) };
}

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loader: ScheduleInputLoader
  ) {}

  /**
   * One schedule per department and period: periods of the same department may not overlap, or two schedules could
   * staff the same shift. The check and the insert run in one serializable transaction, so two parallel requests
   * cannot both pass the check (the race of F-05).
   */
  async create(input: ScheduleInput) {
    const departmentId = parsePositiveInt(input.departmentId, 'departmentId');
    const periodStart = parseLocalDate(input.periodStart, 'periodStart');
    const periodEnd = parseLocalDate(input.periodEnd, 'periodEnd');
    if (periodEnd < periodStart) throw new BadRequestException('periodEnd must not be before periodStart');
    if (daysIn(periodStart, periodEnd) > MAX_PERIOD_DAYS) {
      throw new BadRequestException(`A planning period can be at most ${MAX_PERIOD_DAYS} days`);
    }
    const start = new Date(`${periodStart}T00:00:00Z`);
    const end = new Date(`${periodEnd}T00:00:00Z`);
    try {
      const created = await this.prisma.$transaction(
        async (tx) => {
          const overlapping = await tx.schedule.findFirst({
            where: { departmentId, periodStart: { lte: end }, periodEnd: { gte: start } },
            select: { id: true }
          });
          if (overlapping) {
            throw new ConflictException(`Schedule ${overlapping.id} of department ${departmentId} already covers part of this period`);
          }
          return tx.schedule.create({ data: { departmentId, periodStart: start, periodEnd: end } });
        },
        { isolationLevel: 'Serializable' }
      );
      return present(created);
    } catch (error) {
      if (errorCode(error) === 'P2003') throw new NotFoundException(`Department ${departmentId} not found`);
      if (isWriteConflict(error)) throw new ConflictException(CONCURRENT);
      throw error;
    }
  }

  /** Staff see every schedule. An employee sees only PUBLISHED schedules (BR-W04) of its department or with its shifts. */
  async findAll(user: AuthUser, departmentId?: number) {
    const filter = departmentId === undefined ? {} : { departmentId };
    const where = user.role === 'EMPLOYEE' ? { AND: [filter, await this.employeeScope(user)] } : filter;
    const rows = await this.prisma.schedule.findMany({ where, orderBy: [{ periodStart: 'desc' }, { id: 'asc' }] });
    return rows.map(present);
  }

  /**
   * An employee gets 404 for a schedule outside its scope, so it cannot even learn that a draft exists, and sees only
   * its own assignments (BR-A03).
   */
  async findOne(id: number, user: AuthUser) {
    const scope = user.role === 'EMPLOYEE' ? await this.employeeScope(user) : {};
    const row = await this.prisma.schedule.findFirst({ where: { AND: [{ id }, scope] }, include: DETAIL });
    if (!row) throw new NotFoundException(`Schedule ${id} not found`);
    const assignments = user.role === 'EMPLOYEE' ? row.assignments.filter((a) => a.employeeId === user.sub) : row.assignments;
    return { ...present(row), assignments, actions: allowedActions(row.status, user.role) };
  }

  /** The hard violations and quality scores of the schedule as it is now, with today's data. */
  async check(id: number) {
    const input = await this.loader.load(await this.require(id));
    return {
      violations: validateSchedule(input, input.lockedAssignments),
      scores: qualityReport(input, input.lockedAssignments)
    };
  }

  /**
   * Runs the engine around the assignments made by hand and saves what it adds. The save only succeeds when the
   * schedule has not changed since it was read (same updatedAt), so a parallel edit is not overwritten.
   */
  async generate(id: number, user: AuthUser) {
    const row = await this.require(id);
    if (!nextStatus(row.status, 'generate')) await this.refuse(id, 'generate');
    const input = await this.loader.load(row);
    const result = runEngine(input);
    const scores = qualityReport(input, result.assignments);
    const locked = new Set(input.lockedAssignments.map((a) => `${a.shiftId}:${a.employeeId}`));
    const added = result.assignments.filter((a) => !locked.has(`${a.shiftId}:${a.employeeId}`));
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.schedule.updateMany({
        where: { id, status: { in: [...WORKFLOW.generate.from] }, updatedAt: row.updatedAt },
        data: { status: WORKFLOW.generate.to, qualityScore: Math.round(scores.quality) }
      });
      if (saved.count === 0) throw new ConflictException(CONCURRENT);
      await tx.assignment.createMany({ data: added.map((a) => ({ scheduleId: id, ...a })) });
    });
    return { schedule: await this.findOne(id, user), added: added.length, violations: result.violations, scores };
  }

  /** A hand edit (BR-W01). It moves an OPTIMIZED schedule back to DRAFT and clears the quality score. */
  async addAssignment(id: number, input: AssignmentInput) {
    const shiftId = parsePositiveInt(input.shiftId, 'shiftId');
    const employeeId = parsePositiveInt(input.employeeId, 'employeeId');
    const row = await this.require(id);
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId }, select: { departmentId: true } });
    if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);
    if (shift.departmentId !== row.departmentId) {
      throw new BadRequestException(`Shift ${shiftId} belongs to another department than schedule ${id}`);
    }
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.startEdit(tx, id);
        return tx.assignment.create({ data: { scheduleId: id, shiftId, employeeId } });
      });
    } catch (error) {
      if (errorCode(error) === 'P2002') {
        throw new ConflictException(`Employee ${employeeId} is already assigned to shift ${shiftId} in schedule ${id}`);
      }
      throw error;
    }
  }

  async removeAssignment(id: number, assignmentId: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.startEdit(tx, id);
      const removed = await tx.assignment.deleteMany({ where: { id: assignmentId, scheduleId: id } });
      if (removed.count === 0) throw new NotFoundException(`Assignment ${assignmentId} not found in schedule ${id}`);
    });
  }

  /** Only a schedule that can still be edited can be deleted, so an approved or published one stays on record. */
  async remove(id: number) {
    const removed = await this.prisma.schedule.deleteMany({ where: { id, status: { in: [...WORKFLOW.edit.from] } } });
    if (removed.count === 0) await this.refuse(id, 'edit');
  }

  /** Submit, reject and publish need no data check. The status condition in the update makes each one atomic. */
  async move(id: number, action: 'submit' | 'reject' | 'publish', user: AuthUser) {
    const { from, to } = WORKFLOW[action];
    const moved = await this.prisma.schedule.updateMany({ where: { id, status: { in: [...from] } }, data: { status: to } });
    if (moved.count === 0) await this.refuse(id, action);
    return this.findOne(id, user);
  }

  /**
   * BR-W03: approval checks the whole schedule again with the data of this moment, because a qualification may have
   * expired or another schedule may have been approved since generation. The check and the status change run in one
   * serializable transaction, so two schedules that share an employee cannot both be approved by parallel requests.
   */
  async approve(id: number, user: AuthUser) {
    const { from, to } = WORKFLOW.approve;
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const row = await tx.schedule.findUnique({ where: { id } });
          if (!row) throw new NotFoundException(`Schedule ${id} not found`);
          if (!nextStatus(row.status, 'approve')) throw this.conflict(id, 'approve', row.status);
          const input = await this.loader.load(row, tx);
          const violations = validateSchedule(input, input.lockedAssignments);
          if (violations.length > 0) {
            throw new ConflictException({
              statusCode: 409,
              error: 'Conflict',
              message: `Schedule ${id} breaks ${violations.length} hard rule(s) and cannot be approved (BR-W03)`,
              violations
            });
          }
          await tx.schedule.updateMany({ where: { id, status: { in: [...from] } }, data: { status: to } });
        },
        { isolationLevel: 'Serializable' }
      );
    } catch (error) {
      if (isWriteConflict(error)) throw new ConflictException(CONCURRENT);
      throw error;
    }
    return this.findOne(id, user);
  }

  /** BR-W04: published schedules of the employee's own department, or with one of its shifts. */
  private async employeeScope(user: AuthUser) {
    const me = await this.prisma.employee.findUnique({ where: { id: user.sub }, select: { departmentId: true } });
    const mine: object[] = [{ assignments: { some: { employeeId: user.sub } } }];
    if (me?.departmentId) mine.push({ departmentId: me.departmentId });
    return { status: 'PUBLISHED' as const, OR: mine };
  }

  private async require(id: number): Promise<ScheduleRow> {
    const row = await this.prisma.schedule.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Schedule ${id} not found`);
    return row;
  }

  /** Moves the schedule to DRAFT, only from an editable status. The row stays locked until the transaction ends. */
  private async startEdit(db: Pick<PrismaService, 'schedule'>, id: number) {
    const { from, to } = WORKFLOW.edit;
    const started = await db.schedule.updateMany({
      where: { id, status: { in: [...from] } },
      data: { status: to, qualityScore: null }
    });
    if (started.count === 0) await this.refuse(id, 'edit');
  }

  /** Explains why a conditional update changed nothing: 404 when the schedule is missing, 409 for its status. */
  private async refuse(id: number, action: WorkflowAction): Promise<never> {
    const row = await this.prisma.schedule.findUnique({ where: { id }, select: { status: true } });
    if (!row) throw new NotFoundException(`Schedule ${id} not found`);
    throw this.conflict(id, action, row.status);
  }

  private conflict(id: number, action: WorkflowAction, status: ScheduleStatus) {
    if (action === 'edit') {
      return new ConflictException(`Schedule ${id} is ${status}: only DRAFT and OPTIMIZED schedules can be changed (BR-W01)`);
    }
    const allowed = WORKFLOW[action].from.join(' or ');
    return new ConflictException(`Cannot ${action} schedule ${id} while it is ${status}: it must be ${allowed}`);
  }
}
