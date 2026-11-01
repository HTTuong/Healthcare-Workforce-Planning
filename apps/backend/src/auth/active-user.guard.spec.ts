import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ActiveUserGuard } from './active-user.guard.js';
import type { AuthRequest } from './auth.types.js';
import { Public } from './public.decorator.js';

class Sample {
  @Public()
  login() {}
  profile() {}
}

function contextFor(method: 'login' | 'profile', request: AuthRequest): ExecutionContext {
  return {
    getHandler: () => Sample.prototype[method],
    getClass: () => Sample,
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as ExecutionContext;
}

function makeGuard() {
  const prisma = { employee: { findUnique: vi.fn() } };
  return { prisma, guard: new ActiveUserGuard(prisma as never, new Reflector()) };
}

describe('ActiveUserGuard (F-04)', () => {
  it('does not look anything up for a public endpoint', async () => {
    const { prisma, guard } = makeGuard();
    await expect(guard.canActivate(contextFor('login', { headers: {} }))).resolves.toBe(true);
    expect(prisma.employee.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a deactivated account even though its token is still valid', async () => {
    const { prisma, guard } = makeGuard();
    prisma.employee.findUnique.mockResolvedValue({ active: false, role: 'EMPLOYEE' });
    const request: AuthRequest = { headers: {}, user: { sub: 4, role: 'EMPLOYEE' } };
    await expect(guard.canActivate(contextFor('profile', request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a token whose account no longer exists', async () => {
    const { prisma, guard } = makeGuard();
    prisma.employee.findUnique.mockResolvedValue(null);
    const request: AuthRequest = { headers: {}, user: { sub: 99, role: 'ADMIN' } };
    await expect(guard.canActivate(contextFor('profile', request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('replaces the role from the token with the current role from the database', async () => {
    const { prisma, guard } = makeGuard();
    prisma.employee.findUnique.mockResolvedValue({ active: true, role: 'PLANNER' });
    const request: AuthRequest = { headers: {}, user: { sub: 4, role: 'EMPLOYEE' } };
    await expect(guard.canActivate(contextFor('profile', request))).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 4, role: 'PLANNER' });
    expect(prisma.employee.findUnique).toHaveBeenCalledWith({ where: { id: 4 }, select: { active: true, role: true } });
  });

  it('refuses a request that reached it without an authenticated user', async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(contextFor('profile', { headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
