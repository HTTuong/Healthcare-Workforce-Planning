import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { hashPassword } from './password.js';

const jwt = new JwtService({ secret: 'test-secret-test-secret-test-secret' });
const PASSWORD = 'a long enough password';

function makeService() {
  const prisma = { employee: { findUnique: vi.fn(), update: vi.fn() } };
  return { prisma, service: new AuthService(prisma as never, jwt) };
}

describe('AuthService login', () => {
  let employee: { id: number; role: string; active: boolean; passwordHash: string | null };

  beforeAll(async () => {
    employee = { id: 4, role: 'PLANNER', active: true, passwordHash: await hashPassword(PASSWORD) };
  });

  it('returns a token carrying the id and role for the right password', async () => {
    const { prisma, service } = makeService();
    prisma.employee.findUnique.mockResolvedValue(employee);
    const { accessToken } = await service.login(' Planner@Example.com ', PASSWORD);
    const payload = await jwt.verifyAsync(accessToken);
    expect(payload).toMatchObject({ sub: 4, role: 'PLANNER' });
    expect(prisma.employee.findUnique).toHaveBeenCalledWith({
      where: { email: 'planner@example.com' },
      omit: { passwordHash: false }
    });
  });

  it('gives the same 401 message for every kind of failure', async () => {
    const { prisma, service } = makeService();
    const failures = [
      [null, PASSWORD],
      [employee, 'the wrong password'],
      [{ ...employee, active: false }, PASSWORD],
      [{ ...employee, passwordHash: null }, PASSWORD]
    ] as const;
    for (const [found, password] of failures) {
      prisma.employee.findUnique.mockResolvedValue(found);
      const failure = service.login('x@example.com', password);
      await expect(failure).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(failure).rejects.toMatchObject({ message: 'Invalid email or password' });
    }
  });

  it('rejects a missing or non string email or password with 400', async () => {
    const { service } = makeService();
    await expect(service.login(undefined, PASSWORD)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.login('a@example.com', '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.login({ $ne: '' }, PASSWORD)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AuthService setPassword', () => {
  it('stores a hash and never the password itself', async () => {
    const { prisma, service } = makeService();
    prisma.employee.update.mockResolvedValue({});
    await service.setPassword(4, PASSWORD);
    const stored = prisma.employee.update.mock.calls[0]?.[0].data.passwordHash as string;
    expect(stored).not.toContain(PASSWORD);
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('rejects a password that is too short or too long with 400', async () => {
    const { service } = makeService();
    await expect(service.setPassword(4, 'short')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setPassword(4, 'x'.repeat(129))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setPassword(4, 123456789012)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 404 for an unknown employee (P2025)', async () => {
    const { prisma, service } = makeService();
    prisma.employee.update.mockRejectedValue({ code: 'P2025' });
    await expect(service.setPassword(99, PASSWORD)).rejects.toBeInstanceOf(NotFoundException);
  });
});
