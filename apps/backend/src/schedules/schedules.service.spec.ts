import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/auth.types.js';
import { WRITE_CONFLICT_ATTEMPTS } from '../common/db-errors.js';
import { employee, engineInput, shift } from '../scheduling/engine.fixtures.js';
import type { EngineInput } from '../scheduling/engine.types.js';
import { SchedulesService } from './schedules.service.js';

// Unit tests with a fake database and a fake loader. The real queries, transactions and parallel requests are
// covered by scripts/workflow-smoke.sh against PostgreSQL.

const planner: AuthUser = { sub: 2, role: 'PLANNER' };
const nurse: AuthUser = { sub: 26, role: 'EMPLOYEE' };
const updatedAt = new Date('2026-11-01T10:00:00Z');

function row(status: string, extra: object = {}) {
  return {
    id: 7,
    departmentId: 3,
    periodStart: new Date('2026-11-02T00:00:00Z'),
    periodEnd: new Date('2026-11-08T00:00:00Z'),
    status,
    qualityScore: null,
    createdAt: updatedAt,
    updatedAt,
    ...extra
  };
}

// Two morning shifts in the week of 2/11/2026, one person each, and two employees.
const day = (id: number, date: string) => shift(id, `${date}T06:00:00+02:00`, `${date}T14:00:00+02:00`);
const week = (extra: Partial<EngineInput> = {}) =>
  engineInput({
    period: { start: '2026-11-02', end: '2026-11-08' },
    shifts: [day(1, '2026-11-02'), day(2, '2026-11-03')],
    employees: [employee(1), employee(2)],
    ...extra
  });

function makeService(input: EngineInput = week()) {
  const prisma = {
    schedule: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    assignment: { create: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    shift: { findUnique: vi.fn() },
    employee: { findUnique: vi.fn() },
    $transaction: vi.fn()
  };
  // The fake transaction runs the callback with the same fake client and remembers the options.
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
  const loader = { load: vi.fn().mockResolvedValue(input) };
  return { prisma, loader, service: new SchedulesService(prisma as never, loader as never) };
}

describe('SchedulesService create', () => {
  const valid = { departmentId: 3, periodStart: '2026-11-02', periodEnd: '2026-11-08' };

  it('creates a DRAFT inside a serializable transaction and returns the period as dates', async () => {
    const { prisma, service } = makeService();
    prisma.schedule.findFirst.mockResolvedValue(null);
    prisma.schedule.create.mockResolvedValue(row('DRAFT'));
    const created = await service.create(valid);
    expect(created).toMatchObject({ status: 'DRAFT', periodStart: '2026-11-02', periodEnd: '2026-11-08' });
    expect(prisma.$transaction.mock.calls[0]?.[1]).toEqual({ isolationLevel: 'Serializable' });
    expect(prisma.schedule.create.mock.calls[0]?.[0].data).toEqual({
      departmentId: 3,
      periodStart: new Date('2026-11-02T00:00:00Z'),
      periodEnd: new Date('2026-11-08T00:00:00Z')
    });
  });

  it('accepts a one day period and a period of exactly 42 days, and refuses 43', async () => {
    const { prisma, service } = makeService();
    prisma.schedule.findFirst.mockResolvedValue(null);
    prisma.schedule.create.mockResolvedValue(row('DRAFT'));
    await expect(service.create({ ...valid, periodEnd: '2026-11-02' })).resolves.toBeDefined();
    await expect(service.create({ ...valid, periodEnd: '2026-12-13' })).resolves.toBeDefined();
    await expect(service.create({ ...valid, periodEnd: '2026-12-14' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('counts the days of a period across the end of daylight saving time as calendar days', async () => {
    const { prisma, service } = makeService();
    prisma.schedule.findFirst.mockResolvedValue(null);
    prisma.schedule.create.mockResolvedValue(row('DRAFT'));
    // 19/10/2026 to 29/11/2026 is 42 calendar days and contains the 25 hour day of 25/10.
    await expect(service.create({ ...valid, periodStart: '2026-10-19', periodEnd: '2026-11-29' })).resolves.toBeDefined();
    await expect(service.create({ ...valid, periodStart: '2026-10-18', periodEnd: '2026-11-29' })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects bad input before touching the database', async () => {
    const { prisma, service } = makeService();
    for (const input of [
      {},
      { ...valid, departmentId: '3' },
      { ...valid, periodStart: '2026-02-30' },
      { ...valid, periodStart: '2026-11-02T00:00:00Z' },
      { ...valid, periodEnd: '2026-11-01' }
    ]) {
      await expect(service.create(input), JSON.stringify(input)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a period that overlaps another schedule of the department', async () => {
    const { prisma, service } = makeService();
    prisma.schedule.findFirst.mockResolvedValue({ id: 5 });
    await expect(service.create(valid)).rejects.toThrow('Schedule 5 of department 3 already covers part of this period');
    expect(prisma.schedule.findFirst.mock.calls[0]?.[0].where).toEqual({
      departmentId: 3,
      periodStart: { lte: new Date('2026-11-08T00:00:00Z') },
      periodEnd: { gte: new Date('2026-11-02T00:00:00Z') }
    });
    expect(prisma.schedule.create).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown department and 409 when parallel transactions keep winning', async () => {
    const { prisma, service } = makeService();
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2003' });
    await expect(service.create(valid)).rejects.toBeInstanceOf(NotFoundException);
    // F-11: a conflict is retried, so 409 needs every attempt lost in a row.
    prisma.$transaction.mockReset().mockRejectedValue({ cause: { originalCode: '40001', kind: 'TransactionWriteConflict' } });
    await expect(service.create(valid)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(WRITE_CONFLICT_ATTEMPTS);
  });

  it('runs the transaction again after one lost race and creates the schedule (F-11)', async () => {
    const { prisma, service } = makeService();
    prisma.schedule.findFirst.mockResolvedValue(null);
    prisma.schedule.create.mockResolvedValue(row('DRAFT'));
    prisma.$transaction.mockRejectedValueOnce({ cause: { originalCode: '40001', kind: 'TransactionWriteConflict' } });
    await expect(service.create(valid)).resolves.toMatchObject({ status: 'DRAFT' });
    expect(prisma.schedule.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe('SchedulesService generate', () => {
  it('runs the engine around the locked assignments and saves only what it added', async () => {
    const { prisma, service } = makeService(week({ lockedAssignments: [{ shiftId: 1, employeeId: 2 }] }));
    prisma.schedule.findUnique.mockResolvedValue(row('DRAFT'));
    prisma.schedule.findFirst.mockResolvedValue({ ...row('OPTIMIZED'), assignments: [] });
    const result = await service.generate(7, planner);
    expect(prisma.assignment.createMany).toHaveBeenCalledWith({ data: [{ scheduleId: 7, shiftId: 2, employeeId: 1 }] });
    expect(result.added).toBe(1);
    expect(result.violations).toEqual([]);
  });

  it('saves only when the schedule is still the DRAFT it read, with the rounded quality score', async () => {
    const { prisma, service } = makeService();
    prisma.schedule.findUnique.mockResolvedValue(row('DRAFT'));
    prisma.schedule.findFirst.mockResolvedValue({ ...row('OPTIMIZED'), assignments: [] });
    const result = await service.generate(7, planner);
    const update = prisma.schedule.updateMany.mock.calls[0]?.[0];
    expect(update.where).toEqual({ id: 7, status: { in: ['DRAFT'] }, updatedAt });
    expect(update.data).toEqual({ status: 'OPTIMIZED', qualityScore: Math.round(result.scores.quality) });
  });

  it('refuses to save over a parallel change and adds nothing', async () => {
    const { prisma, service } = makeService();
    prisma.schedule.findUnique.mockResolvedValue(row('DRAFT'));
    prisma.schedule.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.generate(7, planner)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.assignment.createMany).not.toHaveBeenCalled();
  });

  it('refuses a schedule that is not DRAFT without running the engine', async () => {
    const { prisma, loader, service } = makeService();
    for (const status of ['OPTIMIZED', 'REVIEW', 'APPROVED', 'PUBLISHED']) {
      prisma.schedule.findUnique.mockResolvedValue(row(status));
      await expect(service.generate(7, planner), status).rejects.toThrow(`Cannot generate schedule 7 while it is ${status}`);
    }
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('answers 404 for a schedule that does not exist', async () => {
    const { prisma, service } = makeService();
    prisma.schedule.findUnique.mockResolvedValue(null);
    await expect(service.generate(7, planner)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SchedulesService hand edits (BR-W01)', () => {
  function editable() {
    const made = makeService();
    made.prisma.schedule.findUnique.mockResolvedValue(row('OPTIMIZED'));
    made.prisma.shift.findUnique.mockResolvedValue({ departmentId: 3 });
    made.prisma.employee.findUnique.mockResolvedValue({ id: 1 });
    return made;
  }

  it('moves the schedule to DRAFT and clears the quality score, only from an editable status', async () => {
    const { prisma, service } = editable();
    await service.addAssignment(7, { shiftId: 1, employeeId: 1 });
    expect(prisma.schedule.updateMany).toHaveBeenCalledWith({
      where: { id: 7, status: { in: ['DRAFT', 'OPTIMIZED'] } },
      data: { status: 'DRAFT', qualityScore: null }
    });
    expect(prisma.assignment.create).toHaveBeenCalledWith({ data: { scheduleId: 7, shiftId: 1, employeeId: 1 } });
  });

  it('refuses an edit of a schedule in review, approved or published', async () => {
    const { prisma, service } = editable();
    prisma.schedule.updateMany.mockResolvedValue({ count: 0 });
    for (const status of ['REVIEW', 'APPROVED', 'PUBLISHED']) {
      prisma.schedule.findUnique.mockResolvedValue(row(status));
      await expect(service.addAssignment(7, { shiftId: 1, employeeId: 1 }), status).rejects.toThrow(
        `Schedule 7 is ${status}: only DRAFT and OPTIMIZED schedules can be changed (BR-W01)`
      );
      await expect(service.removeAssignment(7, 9), status).rejects.toBeInstanceOf(ConflictException);
    }
    expect(prisma.assignment.create).not.toHaveBeenCalled();
    expect(prisma.assignment.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a shift of another department and unknown shifts or employees', async () => {
    const { prisma, service } = editable();
    prisma.shift.findUnique.mockResolvedValueOnce({ departmentId: 4 });
    await expect(service.addAssignment(7, { shiftId: 1, employeeId: 1 })).rejects.toBeInstanceOf(BadRequestException);
    prisma.shift.findUnique.mockResolvedValueOnce(null);
    await expect(service.addAssignment(7, { shiftId: 1, employeeId: 1 })).rejects.toBeInstanceOf(NotFoundException);
    prisma.employee.findUnique.mockResolvedValueOnce(null);
    await expect(service.addAssignment(7, { shiftId: 1, employeeId: 1 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.addAssignment(7, { shiftId: 0, employeeId: 1 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('answers 409 for an assignment that already exists', async () => {
    const { prisma, service } = editable();
    prisma.assignment.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.addAssignment(7, { shiftId: 1, employeeId: 1 })).rejects.toThrow(
      'Employee 1 is already assigned to shift 1 in schedule 7'
    );
  });

  it('removes only an assignment of this schedule, and 404 rolls the status change back', async () => {
    const { prisma, service } = editable();
    prisma.assignment.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.removeAssignment(7, 9)).rejects.toThrow('Assignment 9 not found in schedule 7');
    expect(prisma.assignment.deleteMany).toHaveBeenCalledWith({ where: { id: 9, scheduleId: 7 } });
  });

  it('deletes only an editable schedule', async () => {
    const { prisma, service } = editable();
    await service.remove(7);
    expect(prisma.schedule.deleteMany).toHaveBeenCalledWith({ where: { id: 7, status: { in: ['DRAFT', 'OPTIMIZED'] } } });
    prisma.schedule.deleteMany.mockResolvedValue({ count: 0 });
    prisma.schedule.findUnique.mockResolvedValue(row('APPROVED'));
    await expect(service.remove(7)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('SchedulesService transitions', () => {
  it('changes the status only from the allowed status, in one conditional update', async () => {
    const { prisma, service } = makeService();
    prisma.schedule.findFirst.mockResolvedValue({ ...row('REVIEW'), assignments: [] });
    await service.move(7, 'submit', planner);
    expect(prisma.schedule.updateMany).toHaveBeenCalledWith({ where: { id: 7, status: { in: ['OPTIMIZED'] } }, data: { status: 'REVIEW' } });
    await service.move(7, 'publish', planner);
    expect(prisma.schedule.updateMany).toHaveBeenLastCalledWith({
      where: { id: 7, status: { in: ['APPROVED'] } },
      data: { status: 'PUBLISHED' }
    });
  });

  it('explains a refused transition: 404 when missing, 409 with the required status otherwise', async () => {
    const { prisma, service } = makeService();
    prisma.schedule.updateMany.mockResolvedValue({ count: 0 });
    prisma.schedule.findUnique.mockResolvedValueOnce(null);
    await expect(service.move(7, 'publish', planner)).rejects.toBeInstanceOf(NotFoundException);
    prisma.schedule.findUnique.mockResolvedValueOnce({ status: 'REVIEW' });
    await expect(service.move(7, 'publish', planner)).rejects.toThrow('Cannot publish schedule 7 while it is REVIEW: it must be APPROVED');
  });
});

describe('SchedulesService approve (BR-W03)', () => {
  it('refuses a schedule with hard violations, lists them, and leaves the status alone', async () => {
    // Shift 2 has nobody: a BR-H06 shortage.
    const { prisma, service } = makeService(week({ lockedAssignments: [{ shiftId: 1, employeeId: 1 }] }));
    prisma.schedule.findUnique.mockResolvedValue(row('REVIEW'));
    const error = await service.approve(7, planner).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    const body = (error as ConflictException).getResponse() as { message: string; violations: Array<{ ruleId: string }> };
    expect(body.message).toBe('Schedule 7 breaks 1 hard rule(s) and cannot be approved (BR-W03)');
    expect(body.violations.map((violation) => violation.ruleId)).toEqual(['BR-H06']);
    expect(prisma.schedule.updateMany).not.toHaveBeenCalled();
  });

  it('approves a complete schedule, reading and writing in one serializable transaction', async () => {
    const { prisma, loader, service } = makeService(
      week({ lockedAssignments: [{ shiftId: 1, employeeId: 1 }, { shiftId: 2, employeeId: 2 }] })
    );
    prisma.schedule.findUnique.mockResolvedValue(row('REVIEW'));
    prisma.schedule.findFirst.mockResolvedValue({ ...row('APPROVED'), assignments: [] });
    await service.approve(7, planner);
    expect(prisma.$transaction.mock.calls[0]?.[1]).toEqual({ isolationLevel: 'Serializable' });
    // The loader reads through the transaction client, so the check sees the same snapshot as the update.
    expect(loader.load.mock.calls[0]?.[1]).toBe(prisma);
    expect(prisma.schedule.updateMany).toHaveBeenCalledWith({ where: { id: 7, status: { in: ['REVIEW'] } }, data: { status: 'APPROVED' } });
  });

  it('refuses a schedule that is not in review without checking it', async () => {
    const { prisma, loader, service } = makeService();
    prisma.schedule.findUnique.mockResolvedValue(row('OPTIMIZED'));
    await expect(service.approve(7, planner)).rejects.toThrow('Cannot approve schedule 7 while it is OPTIMIZED: it must be REVIEW');
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('turns a lost race into 409 instead of 500', async () => {
    const { prisma, service } = makeService();
    prisma.$transaction.mockRejectedValue({ cause: { originalCode: '40001', kind: 'TransactionWriteConflict' } });
    await expect(service.approve(7, planner)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(WRITE_CONFLICT_ATTEMPTS);
  });
});

describe('SchedulesService reads (BR-W04, BR-A03)', () => {
  it('limits an employee to published schedules of its department or with its own shifts', async () => {
    const { prisma, service } = makeService();
    prisma.employee.findUnique.mockResolvedValue({ departmentId: 3 });
    prisma.schedule.findMany.mockResolvedValue([]);
    await service.findAll(nurse);
    expect(prisma.schedule.findMany.mock.calls[0]?.[0].where).toEqual({
      AND: [{}, { status: 'PUBLISHED', OR: [{ assignments: { some: { employeeId: 26 } } }, { departmentId: 3 }] }]
    });
  });

  it('gives staff every schedule and an employee only its own assignments', async () => {
    const { prisma, service } = makeService();
    prisma.employee.findUnique.mockResolvedValue({ departmentId: null });
    const assignments = [
      { id: 1, employeeId: 26, shiftId: 1 },
      { id: 2, employeeId: 27, shiftId: 1 }
    ];
    prisma.schedule.findFirst.mockResolvedValue({ ...row('PUBLISHED'), assignments });
    const own = await service.findOne(7, nurse);
    expect(own.assignments).toEqual([assignments[0]]);
    expect(own.actions).toEqual([]);
    expect(prisma.schedule.findFirst.mock.calls[0]?.[0].where).toEqual({
      AND: [{ id: 7 }, { status: 'PUBLISHED', OR: [{ assignments: { some: { employeeId: 26 } } }] }]
    });
    const all = await service.findOne(7, { sub: 3, role: 'MANAGER' });
    expect(all.assignments).toEqual(assignments);
    expect(prisma.schedule.findFirst.mock.calls[1]?.[0].where).toEqual({ AND: [{ id: 7 }, {}] });
  });

  it('answers 404 when the schedule is outside the scope, the same as when it does not exist', async () => {
    const { prisma, service } = makeService();
    prisma.employee.findUnique.mockResolvedValue({ departmentId: 3 });
    prisma.schedule.findFirst.mockResolvedValue(null);
    await expect(service.findOne(7, nurse)).rejects.toThrow('Schedule 7 not found');
  });
});
