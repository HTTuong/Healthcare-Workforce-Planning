import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EmployeesService } from './employees.service.js';

function makeService() {
  const prisma = { employee: { create: vi.fn().mockResolvedValue({ id: 1 }), update: vi.fn() } };
  return { prisma, service: new EmployeesService(prisma as never) };
}

const valid = { firstName: 'Aino', lastName: 'Virtanen', email: 'aino@example.com' };

describe('EmployeesService departmentId input (F-02)', () => {
  it('rejects a department id that does not fit in a database integer, zero or a negative number', async () => {
    const { prisma, service } = makeService();
    for (const departmentId of [3_000_000_000, 0, -1]) {
      await expect(service.create({ ...valid, departmentId })).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.employee.create).not.toHaveBeenCalled();
  });

  it('still accepts a normal department id and null', async () => {
    const { prisma, service } = makeService();
    await service.create({ ...valid, departmentId: 2 });
    await service.create({ ...valid, departmentId: null });
    expect(prisma.employee.create).toHaveBeenCalledTimes(2);
  });
});
