import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AvailabilitiesService } from './availabilities.service.js';

function makeService() {
  const prisma = {
    availability: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
  };
  prisma.availability.findFirst.mockResolvedValue(null);
  return { prisma, service: new AvailabilitiesService(prisma as never) };
}

const input = {
  employeeId: 1,
  startsAt: '2026-10-25T08:00:00+02:00',
  endsAt: '2026-10-25T16:00:00+02:00',
  type: 'UNAVAILABLE'
};

describe('AvailabilitiesService', () => {
  it('creates an availability when nothing overlaps', async () => {
    const { prisma, service } = makeService();
    prisma.availability.create.mockResolvedValue({ id: 1 });
    await service.create(input);
    expect(prisma.availability.create).toHaveBeenCalledWith({
      data: {
        employeeId: 1,
        startsAt: new Date('2026-10-25T06:00:00Z'),
        endsAt: new Date('2026-10-25T14:00:00Z'),
        type: 'UNAVAILABLE'
      }
    });
  });

  it('rejects a timestamp without a UTC offset with 400', async () => {
    const { service } = makeService();
    await expect(service.create({ ...input, startsAt: '2026-10-25T08:00:00' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an end that is not after the start with 400', async () => {
    const { service } = makeService();
    await expect(service.create({ ...input, endsAt: input.startsAt })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown type with 400', async () => {
    const { service } = makeService();
    await expect(service.create({ ...input, type: 'HOLIDAY' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 409 when the range overlaps an existing one', async () => {
    const { prisma, service } = makeService();
    prisma.availability.findFirst.mockResolvedValue({ id: 9, startsAt: new Date(), endsAt: new Date() });
    await expect(service.create(input)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.availability.create).not.toHaveBeenCalled();
  });

  it('uses strict comparisons so touching ranges are not a conflict', async () => {
    const { prisma, service } = makeService();
    prisma.availability.create.mockResolvedValue({ id: 1 });
    await service.create(input);
    expect(prisma.availability.findFirst).toHaveBeenCalledWith({
      where: {
        employeeId: 1,
        startsAt: { lt: new Date('2026-10-25T14:00:00Z') },
        endsAt: { gt: new Date('2026-10-25T06:00:00Z') }
      }
    });
  });

  it('answers 404 for an unknown employee (P2003)', async () => {
    const { prisma, service } = makeService();
    prisma.availability.create.mockRejectedValue({ code: 'P2003' });
    await expect(service.create({ ...input, employeeId: 999 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('excludes the record itself when checking conflicts on update', async () => {
    const { prisma, service } = makeService();
    prisma.availability.findUnique.mockResolvedValue({
      id: 5,
      employeeId: 1,
      startsAt: new Date('2026-10-25T06:00:00Z'),
      endsAt: new Date('2026-10-25T14:00:00Z'),
      type: 'LEAVE'
    });
    prisma.availability.update.mockResolvedValue({ id: 5 });
    await service.update(5, { type: 'UNAVAILABLE' });
    const where = prisma.availability.findFirst.mock.calls[0]?.[0].where;
    expect(where.id).toEqual({ not: 5 });
  });

  it('answers 404 when updating or deleting a missing record', async () => {
    const { prisma, service } = makeService();
    prisma.availability.findUnique.mockResolvedValue(null);
    await expect(service.update(5, { type: 'LEAVE' })).rejects.toBeInstanceOf(NotFoundException);
    prisma.availability.delete.mockRejectedValue({ code: 'P2025' });
    await expect(service.remove(5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters the list by employee when an id is given', async () => {
    const { prisma, service } = makeService();
    await service.findAll(3);
    expect(prisma.availability.findMany).toHaveBeenCalledWith({ where: { employeeId: 3 }, orderBy: { startsAt: 'asc' } });
  });
});