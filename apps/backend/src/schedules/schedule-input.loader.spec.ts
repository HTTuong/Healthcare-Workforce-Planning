import { describe, expect, it, vi } from 'vitest';
import { dateText, periodBounds, ScheduleInputLoader } from './schedule-input.loader.js';

const schedule = {
  id: 7,
  departmentId: 3,
  periodStart: new Date('2026-10-19T00:00:00Z'),
  periodEnd: new Date('2026-10-25T00:00:00Z')
};

function fakeDb() {
  return {
    assignment: {
      findMany: vi
        .fn()
        // First call: the schedule's own assignments. Second call: busy time from other schedules.
        .mockResolvedValueOnce([{ shiftId: 40, employeeId: 9 }])
        .mockResolvedValueOnce([
          { employeeId: 1, shift: { startsAt: new Date('2026-10-18T04:00:00Z'), endsAt: new Date('2026-10-18T12:00:00Z') } }
        ])
    },
    shift: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 40,
          departmentId: 3,
          type: 'NIGHT',
          startsAt: new Date('2026-10-24T19:00:00Z'),
          endsAt: new Date('2026-10-25T04:00:00Z'),
          requiredHeadcount: 2,
          requirements: [{ qualificationId: 5, count: 1 }]
        }
      ])
    },
    employee: {
      findMany: vi.fn().mockResolvedValue([
        { id: 1, active: true, contractMinutesPerWeek: 2295, qualifications: [{ qualificationId: 5, validUntil: new Date('2026-10-24T00:00:00Z') }] },
        { id: 9, active: false, contractMinutesPerWeek: 0, qualifications: [{ qualificationId: 5, validUntil: null }] }
      ])
    },
    availability: { findMany: vi.fn().mockResolvedValue([]) }
  };
}

describe('periodBounds', () => {
  it('runs from local midnight of the first day to local midnight after the last day', () => {
    // 19/10/2026 is still summer time (+03:00), 26/10/2026 is winter time (+02:00): the week lasts 169 hours.
    const { from, to } = periodBounds('2026-10-19', '2026-10-25');
    expect(from.toISOString()).toBe('2026-10-18T21:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-25T22:00:00.000Z');
    expect((to.getTime() - from.getTime()) / 3_600_000).toBe(169);
  });

  it('reads 8 days more on each side, enough for the rest period and a whole week before a Thursday start', () => {
    const { from, to, readFrom, readTo } = periodBounds('2026-10-19', '2026-10-25');
    expect((from.getTime() - readFrom.getTime()) / 86_400_000).toBe(8);
    expect((readTo.getTime() - to.getTime()) / 86_400_000).toBe(8);
  });
});

describe('ScheduleInputLoader', () => {
  it('turns stored dates into local dates', () => {
    expect(dateText(new Date('2026-10-24T00:00:00Z'))).toBe('2026-10-24');
  });

  it('builds the engine input from the rows', async () => {
    const db = fakeDb();
    const input = await new ScheduleInputLoader(db as never).load(schedule);
    expect(input.period).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(input.lockedAssignments).toEqual([{ shiftId: 40, employeeId: 9 }]);
    expect(input.shifts).toEqual([
      {
        id: 40,
        type: 'NIGHT',
        startsAt: new Date('2026-10-24T19:00:00Z'),
        endsAt: new Date('2026-10-25T04:00:00Z'),
        requiredHeadcount: 2,
        requirements: [{ qualificationId: 5, count: 1 }]
      }
    ]);
    expect(input.employees).toEqual([
      { id: 1, active: true, contractMinutesPerWeek: 2295, qualifications: [{ qualificationId: 5, validUntil: '2026-10-24' }] },
      { id: 9, active: false, contractMinutesPerWeek: 0, qualifications: [{ qualificationId: 5, validUntil: null }] }
    ]);
    expect(input.busy).toEqual([
      { employeeId: 1, startsAt: new Date('2026-10-18T04:00:00Z'), endsAt: new Date('2026-10-18T12:00:00Z') }
    ]);
    expect(input.rules.timeZone).toBe('Europe/Helsinki');
  });

  it('loads only shifts inside the period (BR-T03), plus the shifts the schedule already uses', async () => {
    const db = fakeDb();
    await new ScheduleInputLoader(db as never).load(schedule);
    const { from, to } = periodBounds('2026-10-19', '2026-10-25');
    expect(db.shift.findMany.mock.calls[0]?.[0].where).toEqual({
      OR: [{ departmentId: 3, startsAt: { gte: from }, endsAt: { lte: to } }, { id: { in: [40] } }]
    });
  });

  it('takes the department as candidates, plus anyone already assigned by hand', async () => {
    const db = fakeDb();
    await new ScheduleInputLoader(db as never).load(schedule);
    expect(db.employee.findMany.mock.calls[0]?.[0].where).toEqual({ OR: [{ departmentId: 3 }, { id: { in: [9] } }] });
  });

  it('counts as busy only shifts of other schedules that are APPROVED or PUBLISHED', async () => {
    const db = fakeDb();
    await new ScheduleInputLoader(db as never).load(schedule);
    const where = db.assignment.findMany.mock.calls[1]?.[0].where;
    expect(where.employeeId).toEqual({ in: [1, 9] });
    expect(where.scheduleId).toEqual({ not: 7 });
    expect(where.schedule).toEqual({ status: { in: ['APPROVED', 'PUBLISHED'] } });
  });

  it('reads through the client it is given, so approval can read inside its transaction', async () => {
    const own = fakeDb();
    const tx = fakeDb();
    await new ScheduleInputLoader(own as never).load(schedule, tx as never);
    expect(tx.shift.findMany).toHaveBeenCalled();
    expect(own.shift.findMany).not.toHaveBeenCalled();
  });
});
