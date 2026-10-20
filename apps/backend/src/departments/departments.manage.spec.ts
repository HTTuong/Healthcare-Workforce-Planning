import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DepartmentsService } from './departments.service.js';

function makeService() {
  const prisma = { department: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() } };
  return { prisma, service: new DepartmentsService(prisma as never) };
}

const unused = { id: 2, _count: { employees: 0, shifts: 0, schedules: 0 } };

describe('DepartmentsService update', () => {
  it('trims the values and updates only the fields that are sent', async () => {
    const { prisma, service } = makeService();
    prisma.department.update.mockResolvedValue({ id: 1 });
    await service.update(1, { name: ' Intensive Care ' });
    expect(prisma.department.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { name: 'Intensive Care' } });
  });

  it('rejects an empty body and empty values with 400', async () => {
    const { service } = makeService();
    await expect(service.update(1, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(1, { code: '  ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a duplicate code to 409 and a missing department to 404', async () => {
    const { prisma, service } = makeService();
    prisma.department.update.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.update(1, { code: 'ER' })).rejects.toBeInstanceOf(ConflictException);
    prisma.department.update.mockRejectedValueOnce({ code: 'P2025' });
    await expect(service.update(99, { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DepartmentsService remove', () => {
  it('deletes a department that nothing uses', async () => {
    const { prisma, service } = makeService();
    prisma.department.findUnique.mockResolvedValue(unused);
    await service.remove(2);
    expect(prisma.department.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });

  it('refuses with 409 when employees, shifts or schedules still exist', async () => {
    const { prisma, service } = makeService();
    prisma.department.findUnique.mockResolvedValue({ id: 2, _count: { employees: 0, shifts: 1, schedules: 0 } });
    await expect(service.remove(2)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.department.delete).not.toHaveBeenCalled();
  });

  it('answers 404 for a missing department', async () => {
    const { prisma, service } = makeService();
    prisma.department.findUnique.mockResolvedValue(null);
    await expect(service.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});