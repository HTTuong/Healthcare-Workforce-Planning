import { ConflictException, NotFoundException } from '@nestjs/common';
import { DepartmentsService } from './departments.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function createService() {
  // A fake Prisma client: unit tests must not need a database.
  const prisma = {
    department: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
  const service = new DepartmentsService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('DepartmentsService', () => {
  it('throws NotFoundException for an unknown id', async () => {
    const { service, prisma } = createService();
    prisma.department.findUnique.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });

  it('turns a duplicate department code into ConflictException', async () => {
    const { service, prisma } = createService();
    prisma.department.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.create('ER', 'Emergency')).rejects.toThrow(ConflictException);
  });
});
