import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { AuthRequest } from './auth.types.js';
import { Public } from './public.decorator.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

@Roles('ADMIN')
class Sample {
  @Public()
  login() {}

  @Roles('PLANNER', 'MANAGER')
  shared() {}

  adminOnly() {}
}

class Undeclared {
  anything() {}
}

function contextFor(target: typeof Sample | typeof Undeclared, method: string, request: AuthRequest): ExecutionContext {
  const handler = (target.prototype as unknown as Record<string, () => void>)[method];
  return {
    getHandler: () => handler,
    getClass: () => target,
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as ExecutionContext;
}

const guard = new RolesGuard(new Reflector());
const as = (role: 'ADMIN' | 'PLANNER' | 'MANAGER' | 'EMPLOYEE'): AuthRequest => ({ headers: {}, user: { sub: 1, role } });

describe('RolesGuard', () => {
  it('lets a public endpoint through even though no user is attached', () => {
    expect(guard.canActivate(contextFor(Sample, 'login', { headers: {} }))).toBe(true);
  });

  it('closes an endpoint that declares no roles (deny by default)', () => {
    expect(() => guard.canActivate(contextFor(Undeclared, 'anything', as('ADMIN')))).toThrow(ForbiddenException);
  });

  it('allows a role that is listed and refuses the others with 403', () => {
    expect(guard.canActivate(contextFor(Sample, 'adminOnly', as('ADMIN')))).toBe(true);
    expect(() => guard.canActivate(contextFor(Sample, 'adminOnly', as('EMPLOYEE')))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(Sample, 'adminOnly', as('PLANNER')))).toThrow(ForbiddenException);
  });

  it('lets the method level roles override the class level roles', () => {
    expect(guard.canActivate(contextFor(Sample, 'shared', as('PLANNER')))).toBe(true);
    expect(guard.canActivate(contextFor(Sample, 'shared', as('MANAGER')))).toBe(true);
    expect(() => guard.canActivate(contextFor(Sample, 'shared', as('ADMIN')))).toThrow(ForbiddenException);
  });

  it('refuses a request that has no authenticated user', () => {
    expect(() => guard.canActivate(contextFor(Sample, 'adminOnly', { headers: {} }))).toThrow(ForbiddenException);
  });
});