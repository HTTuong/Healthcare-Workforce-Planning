import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AvailabilitiesService } from './availabilities.service.js';

function makeService() {
  const prisma = { availability: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() } };
  return { prisma, service: new AvailabilitiesService(prisma as never) };
}

const valid = {
  employeeId: 4,
  startsAt: '2027-03-01T08:00:00+02:00',
  endsAt: '2027-03-01T16:00:00+02:00',
  type: 'LEAVE'
};

describe('AvailabilitiesService create input', () => {
  it('rejects an employee id that does not fit in a database integer (F-02)', async () => {
    const { prisma, service } = makeService();
    await expect(service.create({ ...valid, employeeId: 3_000_000_000 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.availability.create).not.toHaveBeenCalled();
  });

  it('rejects 30 February instead of storing it as 2 March (F-03)', async () => {
    const { prisma, service } = makeService();
    await expect(
      service.create({ ...valid, startsAt: '2027-02-30T08:00:00+02:00', endsAt: '2027-02-30T16:00:00+02:00' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.availability.create).not.toHaveBeenCalled();
  });
});
