import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DepartmentsService } from './departments.service.js';

function makeService() {
  const prisma = { department: { create: vi.fn() } };
  return { prisma, service: new DepartmentsService(prisma as never) };
}

describe('DepartmentsService create input (F-01)', () => {
  it('rejects a missing, blank or non string code or name with 400 before reaching the database', async () => {
    const { prisma, service } = makeService();
    const bad: Array<[unknown, unknown]> = [
      [undefined, undefined],
      ['QA', undefined],
      [1, 2],
      ['  ', 'Blank'],
      ['QA', '']
    ];
    for (const [code, name] of bad) {
      await expect(service.create(code, name)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.department.create).not.toHaveBeenCalled();
  });

  it('trims the code and the name', async () => {
    const { prisma, service } = makeService();
    prisma.department.create.mockResolvedValue({ id: 1 });
    await service.create(' ICU ', ' Intensive Care ');
    expect(prisma.department.create).toHaveBeenCalledWith({ data: { code: 'ICU', name: 'Intensive Care' } });
  });
});
