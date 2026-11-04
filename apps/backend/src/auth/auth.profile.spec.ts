import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

// GET /auth/me returns the profile the UI shows after login (day 21/11).
function makeService() {
  const prisma = { employee: { findUnique: vi.fn() } };
  return { prisma, service: new AuthService(prisma as never, new JwtService({ secret: 'x'.repeat(32) })) };
}

describe('AuthService profile', () => {
  it('keeps sub and role and adds name, email and department', async () => {
    const { prisma, service } = makeService();
    prisma.employee.findUnique.mockResolvedValue({ firstName: 'Noora', lastName: 'Nurse', email: 'noora@example.com', departmentId: 3 });
    await expect(service.profile({ sub: 26, role: 'EMPLOYEE' })).resolves.toEqual({
      sub: 26,
      role: 'EMPLOYEE',
      firstName: 'Noora',
      lastName: 'Nurse',
      email: 'noora@example.com',
      departmentId: 3
    });
  });

  it('asks only for fields that are safe to show, never the password hash', async () => {
    const { prisma, service } = makeService();
    prisma.employee.findUnique.mockResolvedValue({ firstName: 'A', lastName: 'B', email: 'a@example.com', departmentId: null });
    await service.profile({ sub: 26, role: 'EMPLOYEE' });
    expect(prisma.employee.findUnique).toHaveBeenCalledWith({
      where: { id: 26 },
      select: { firstName: true, lastName: true, email: true, departmentId: true }
    });
  });

  it('answers 401 when the account was deleted after the guard checked it', async () => {
    const { prisma, service } = makeService();
    prisma.employee.findUnique.mockResolvedValue(null);
    await expect(service.profile({ sub: 26, role: 'EMPLOYEE' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
