import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StaffingRequirementsService } from './staffing-requirements.service.js';

function makeService() {
  const prisma = {
    department: { findUnique: vi.fn() },
    staffingRequirement: { findMany: vi.fn(), upsert: vi.fn(), delete: vi.fn() }
  };
  return { prisma, service: new StaffingRequirementsService(prisma as never) };
}

describe('StaffingRequirementsService', () => {
  it('upserts one row per department and shift type', async () => {
    const { prisma, service } = makeService();
    prisma.staffingRequirement.upsert.mockResolvedValue({});
    await service.set(1, 'NIGHT', 3);
    expect(prisma.staffingRequirement.upsert).toHaveBeenCalledWith({
      where: { departmentId_shiftType: { departmentId: 1, shiftType: 'NIGHT' } },
      create: { departmentId: 1, shiftType: 'NIGHT', minHeadcount: 3 },
      update: { minHeadcount: 3 }
    });
  });

  it('rejects an unknown shift type with 400', async () => {
    const { service } = makeService();
    await expect(service.set(1, 'DAY', 3)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.remove(1, 'DAY')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a minimum below 1 or not an integer with 400', async () => {
    const { service } = makeService();
    await expect(service.set(1, 'NIGHT', 0)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.set(1, 'NIGHT', 2.5)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.set(1, 'NIGHT', '3')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 404 for an unknown department (P2003)', async () => {
    const { prisma, service } = makeService();
    prisma.staffingRequirement.upsert.mockRejectedValue({ code: 'P2003' });
    await expect(service.set(999, 'NIGHT', 3)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 when listing for a missing department', async () => {
    const { prisma, service } = makeService();
    prisma.department.findUnique.mockResolvedValue(null);
    await expect(service.findAll(999)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.staffingRequirement.findMany).not.toHaveBeenCalled();
  });

  it('answers 404 when removing a requirement that does not exist (P2025)', async () => {
    const { prisma, service } = makeService();
    prisma.staffingRequirement.delete.mockRejectedValue({ code: 'P2025' });
    await expect(service.remove(1, 'NIGHT')).rejects.toBeInstanceOf(NotFoundException);
  });
});