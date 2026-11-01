import { describe, expect, it, vi } from 'vitest';
import { AvailabilitiesService } from './availabilities.service.js';

function makeService() {
  const prisma = { availability: { findMany: vi.fn() } };
  return { prisma, service: new AvailabilitiesService(prisma as never) };
}

describe('AvailabilitiesService findInScope', () => {
  it('filters by employee, by department, or both', async () => {
    const { prisma, service } = makeService();
    await service.findInScope({ employeeId: 4 });
    await service.findInScope({ departmentId: 3 });
    await service.findInScope({ employeeId: 7, departmentId: 3 });
    const filters = prisma.availability.findMany.mock.calls.map((call) => call[0].where);
    expect(filters).toEqual([
      { employeeId: 4 },
      { employee: { departmentId: 3 } },
      { employeeId: 7, employee: { departmentId: 3 } }
    ]);
  });

  it('returns everything for an empty scope', async () => {
    const { prisma, service } = makeService();
    await service.findInScope({});
    expect(prisma.availability.findMany).toHaveBeenCalledWith({ where: {}, orderBy: { startsAt: 'asc' } });
  });
});
