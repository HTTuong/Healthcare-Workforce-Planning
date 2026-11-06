import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { assertNoLockedSchedule } from './shift-lock.js';

// The week 2031-03-03 to 2031-03-09 in Helsinki (+02:00) runs from 2031-03-02T22:00Z to 2031-03-09T22:00Z.
const week = { periodStart: new Date('2031-03-03T00:00:00Z'), periodEnd: new Date('2031-03-09T00:00:00Z') };
const monday = { departmentId: 4, startsAt: new Date('2031-03-03T05:00:00Z'), endsAt: new Date('2031-03-03T13:00:00Z') };

function fakePrisma(schedules: object[]) {
  const findMany = vi.fn().mockResolvedValue(schedules);
  return { prisma: { schedule: { findMany } } as never, findMany };
}

describe('assertNoLockedSchedule (R-WF-02, BR-W01)', () => {
  it('asks only for schedules that can no longer change', async () => {
    const { prisma, findMany } = fakePrisma([]);
    await assertNoLockedSchedule(prisma, [{ id: 9, ...monday }]);
    expect(findMany.mock.calls[0]?.[0].where.status).toEqual({ in: ['REVIEW', 'APPROVED', 'PUBLISHED'] });
  });

  it('refuses a shift inside the period of an approved schedule of its department', async () => {
    const { prisma } = fakePrisma([{ id: 3, status: 'APPROVED', departmentId: 4, ...week, assignments: [] }]);
    await expect(assertNoLockedSchedule(prisma, [monday])).rejects.toThrow(
      'A shift at this time is part of schedule 3, which is APPROVED. Only DRAFT and OPTIMIZED schedules can change (BR-W01)'
    );
    await expect(assertNoLockedSchedule(prisma, [{ id: 9, ...monday }])).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a shift the schedule has an assignment for, wherever the shift is now', async () => {
    const elsewhere = { id: 9, departmentId: 4, startsAt: new Date('2031-04-01T05:00:00Z'), endsAt: new Date('2031-04-01T13:00:00Z') };
    const { prisma } = fakePrisma([{ id: 3, status: 'PUBLISHED', departmentId: 4, ...week, assignments: [{ id: 1 }] }]);
    await expect(assertNoLockedSchedule(prisma, [elsewhere])).rejects.toThrow('Shift 9 is part of schedule 3, which is PUBLISHED');
  });

  it('uses local midnight for the edges: a night that ends after the period is not part of it (BR-T03)', async () => {
    const { prisma } = fakePrisma([{ id: 3, status: 'REVIEW', departmentId: 4, ...week, assignments: [] }]);
    // Sunday 9 March 22:00 to Monday 10 March 07:30 local.
    const sundayNight = { departmentId: 4, startsAt: new Date('2031-03-09T20:00:00Z'), endsAt: new Date('2031-03-10T05:30:00Z') };
    await expect(assertNoLockedSchedule(prisma, [sundayNight])).resolves.toBeUndefined();
    // Monday 3 March 00:00 to 07:00 local starts exactly at the start of the period.
    const firstHours = { departmentId: 4, startsAt: new Date('2031-03-02T22:00:00Z'), endsAt: new Date('2031-03-03T05:00:00Z') };
    await expect(assertNoLockedSchedule(prisma, [firstHours])).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets a shift of another department through', async () => {
    const { prisma } = fakePrisma([{ id: 3, status: 'PUBLISHED', departmentId: 5, ...week, assignments: [] }]);
    await expect(assertNoLockedSchedule(prisma, [monday])).resolves.toBeUndefined();
  });
});
