import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { QualificationsService } from './qualifications.service.js';

function makeService() {
  const prisma = { qualification: { findMany: vi.fn(), create: vi.fn() } };
  return { prisma, service: new QualificationsService(prisma as never) };
}

describe('QualificationsService', () => {
  it('creates a qualification with trimmed values', async () => {
    const { prisma, service } = makeService();
    prisma.qualification.create.mockResolvedValue({ id: 1 });
    await service.create(' RN ', ' Registered Nurse ');
    expect(prisma.qualification.create).toHaveBeenCalledWith({ data: { code: 'RN', name: 'Registered Nurse' } });
  });

  it('rejects missing or empty fields with 400', async () => {
    const { service } = makeService();
    await expect(service.create('', 'x')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('RN', undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a duplicate code (P2002) to 409', async () => {
    const { prisma, service } = makeService();
    prisma.qualification.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.create('RN', 'Nurse')).rejects.toBeInstanceOf(ConflictException);
  });
});