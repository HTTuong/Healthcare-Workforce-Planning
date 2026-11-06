import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ShiftsService } from './shifts.service.js';

function makeService() {
  const prisma = {
    shift: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    shiftRequirement: { upsert: vi.fn(), delete: vi.fn() },
    // No schedule in REVIEW, APPROVED or PUBLISHED holds the shift unless a test says so (R-WF-02).
    schedule: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() }
  };
  return { prisma, service: new ShiftsService(prisma as never) };
}

// Night shift across midnight and across the end of daylight saving time (25/10/2026).
// 22:00+03:00 is 19:00Z, 06:00+02:00 is 04:00Z, so the shift lasts 9 hours, not 8 (BR-T02).
const input = {
  departmentId: 1,
  type: 'NIGHT',
  startsAt: '2026-10-24T22:00:00+03:00',
  endsAt: '2026-10-25T06:00:00+02:00',
  requiredHeadcount: 2,
  requirements: [{ qualificationId: 1, count: 1 }]
};

describe('ShiftsService create', () => {
  it('stores a night shift across the DST change as 9 real hours, with nested requirements', async () => {
    const { prisma, service } = makeService();
    prisma.shift.create.mockResolvedValue({ id: 1 });
    await service.create(input);
    const call = prisma.shift.create.mock.calls[0]?.[0];
    expect(call.data.startsAt).toEqual(new Date('2026-10-24T19:00:00Z'));
    expect(call.data.endsAt).toEqual(new Date('2026-10-25T04:00:00Z'));
    expect((call.data.endsAt.getTime() - call.data.startsAt.getTime()) / 3_600_000).toBe(9);
    expect(call.data.requirements).toEqual({ create: [{ qualificationId: 1, count: 1 }] });
  });

  it('rejects a timestamp without an offset and an end that is not after the start', async () => {
    const { service } = makeService();
    await expect(service.create({ ...input, startsAt: '2026-10-24T22:00:00' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...input, endsAt: input.startsAt })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown type and a headcount below 1', async () => {
    const { service } = makeService();
    await expect(service.create({ ...input, type: 'DAY' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...input, requiredHeadcount: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...input, requiredHeadcount: 1.5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a requirement count above the headcount', async () => {
    const { service } = makeService();
    await expect(
      service.create({ ...input, requirements: [{ qualificationId: 1, count: 3 }] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows requirement counts that add up to more than the headcount', async () => {
    const { prisma, service } = makeService();
    prisma.shift.create.mockResolvedValue({ id: 1 });
    await service.create({
      ...input,
      requirements: [
        { qualificationId: 1, count: 2 },
        { qualificationId: 2, count: 2 }
      ]
    });
    expect(prisma.shift.create).toHaveBeenCalledOnce();
  });

  it('rejects the same qualification twice', async () => {
    const { service } = makeService();
    await expect(
      service.create({
        ...input,
        requirements: [
          { qualificationId: 1, count: 1 },
          { qualificationId: 1, count: 1 }
        ]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 404 for an unknown department or qualification (P2003)', async () => {
    const { prisma, service } = makeService();
    prisma.shift.create.mockRejectedValue({ code: 'P2003' });
    await expect(service.create(input)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ShiftsService update, remove and requirements', () => {
  const existing = {
    id: 5,
    type: 'NIGHT',
    startsAt: new Date('2026-10-24T19:00:00Z'),
    endsAt: new Date('2026-10-25T04:00:00Z'),
    requiredHeadcount: 3,
    requirements: [{ qualificationId: 1, count: 2 }]
  };

  it('keeps the stored values of fields that are not sent', async () => {
    const { prisma, service } = makeService();
    prisma.shift.findUnique.mockResolvedValue(existing);
    prisma.shift.update.mockResolvedValue({ id: 5 });
    await service.update(5, { endsAt: '2026-10-25T07:00:00+02:00' });
    const data = prisma.shift.update.mock.calls[0]?.[0].data;
    expect(data.startsAt).toEqual(existing.startsAt);
    expect(data.endsAt).toEqual(new Date('2026-10-25T05:00:00Z'));
  });

  it('refuses to lower the headcount below an existing requirement count', async () => {
    const { prisma, service } = makeService();
    prisma.shift.findUnique.mockResolvedValue(existing);
    await expect(service.update(5, { requiredHeadcount: 1 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.shift.update).not.toHaveBeenCalled();
  });

  it('answers 404 when the shift is missing', async () => {
    const { prisma, service } = makeService();
    prisma.shift.findUnique.mockResolvedValue(null);
    await expect(service.update(5, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.findOne(5)).rejects.toBeInstanceOf(NotFoundException);
    prisma.shift.delete.mockRejectedValue({ code: 'P2025' });
    await expect(service.remove(5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('upserts a requirement and checks it against the headcount', async () => {
    const { prisma, service } = makeService();
    prisma.shift.findUnique.mockResolvedValue(existing);
    prisma.shiftRequirement.upsert.mockResolvedValue({});
    await service.setRequirement(5, 2, 3);
    expect(prisma.shiftRequirement.upsert).toHaveBeenCalledWith({
      where: { shiftId_qualificationId: { shiftId: 5, qualificationId: 2 } },
      create: { shiftId: 5, qualificationId: 2, count: 3 },
      update: { count: 3 }
    });
    await expect(service.setRequirement(5, 2, 4)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 404 for a requirement that does not exist', async () => {
    const { prisma, service } = makeService();
    prisma.shiftRequirement.delete.mockRejectedValue({ code: 'P2025' });
    await expect(service.removeRequirement(5, 9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters the list by department when an id is given', async () => {
    const { prisma, service } = makeService();
    await service.findAll(2);
    expect(prisma.shift.findMany).toHaveBeenCalledWith({
      where: { departmentId: 2 },
      orderBy: { startsAt: 'asc' },
      include: { requirements: true }
    });
  });
});
describe('ShiftsService and schedules that can no longer change (R-WF-02, BR-W01)', () => {
  const stored = {
    id: 5,
    departmentId: 4,
    type: 'MORNING',
    startsAt: new Date('2031-03-03T05:00:00Z'),
    endsAt: new Date('2031-03-03T13:00:00Z'),
    requiredHeadcount: 2,
    requirements: []
  };
  const published = {
    id: 3,
    status: 'PUBLISHED',
    departmentId: 4,
    periodStart: new Date('2031-03-03T00:00:00Z'),
    periodEnd: new Date('2031-03-09T00:00:00Z'),
    assignments: [{ id: 1 }]
  };

  function locked() {
    const made = makeService();
    made.prisma.shift.findUnique.mockResolvedValue(stored);
    made.prisma.schedule.findMany.mockResolvedValue([published]);
    return made;
  }

  it('refuses to create, change or delete a shift of a published schedule and writes nothing', async () => {
    const { prisma, service } = locked();
    const create = { departmentId: 4, type: 'MORNING', startsAt: '2031-03-04T07:00:00+02:00', endsAt: '2031-03-04T15:00:00+02:00', requiredHeadcount: 1 };
    await expect(service.create(create)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(5, { requiredHeadcount: 3 })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(5)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.setRequirement(5, 2, 1)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.removeRequirement(5, 2)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.shift.create).not.toHaveBeenCalled();
    expect(prisma.shift.update).not.toHaveBeenCalled();
    expect(prisma.shift.delete).not.toHaveBeenCalled();
    expect(prisma.shiftRequirement.upsert).not.toHaveBeenCalled();
    expect(prisma.shiftRequirement.delete).not.toHaveBeenCalled();
  });

  it('checks a change both where the shift is and where it would go', async () => {
    const { prisma, service } = makeService();
    prisma.shift.findUnique.mockResolvedValue(stored);
    prisma.shift.update.mockResolvedValue({ id: 5 });
    await service.update(5, { startsAt: '2031-03-10T07:00:00+02:00', endsAt: '2031-03-10T15:00:00+02:00' });
    const checked = prisma.schedule.findMany.mock.calls
      .filter((call) => call[0].where.status.in.includes('APPROVED'))
      .map((call) => call[0].where.OR[1].periodEnd.gte.toISOString().slice(0, 10));
    expect(checked).toEqual(['2031-03-02', '2031-03-09']);
  });

  it('sends an optimized schedule that shows the shift back to draft after a change, so it can be generated again (F-12)', async () => {
    const { prisma, service } = makeService();
    prisma.shift.findUnique.mockResolvedValue(stored);
    prisma.shift.update.mockResolvedValue({ id: 5 });
    prisma.schedule.findMany.mockImplementation(async (query: { where: { status: { in: string[] } } }) =>
      query.where.status.in.includes('OPTIMIZED') ? [{ ...published, id: 8, status: 'OPTIMIZED' }] : []
    );
    await service.update(5, { requiredHeadcount: 3 });
    expect(prisma.schedule.updateMany).toHaveBeenCalledWith({ where: { id: { in: [8] }, status: 'OPTIMIZED' }, data: { status: 'DRAFT' } });
  });

  it('leaves the schedules alone when no optimized one shows the shift', async () => {
    const { prisma, service } = makeService();
    prisma.shift.findUnique.mockResolvedValue(stored);
    prisma.shift.update.mockResolvedValue({ id: 5 });
    await service.update(5, { requiredHeadcount: 3 });
    expect(prisma.schedule.updateMany).not.toHaveBeenCalled();
  });
});
