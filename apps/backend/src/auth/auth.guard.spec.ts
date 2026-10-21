import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { AuthGuard } from './auth.guard.js';
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

const jwt = new JwtService({ secret: 'test-secret' });
const guard = new AuthGuard(jwt, new Reflector());
const bearer = (token: string): AuthRequest => ({ headers: { authorization: `Bearer ${token}` } });
const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('AuthGuard', () => {
  it('lets a public endpoint through without any token', async () => {
    await expect(guard.canActivate(contextFor('login', { headers: {} }))).resolves.toBe(true);
  });

  it('rejects a missing header and a scheme other than Bearer with 401', async () => {
    await expect(guard.canActivate(contextFor('profile', { headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(contextFor('profile', { headers: { authorization: 'Basic abc' } }))
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token that is not a JWT', async () => {
    await expect(guard.canActivate(contextFor('profile', bearer('garbage')))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'other-secret' }).signAsync({ sub: 1, role: 'ADMIN' });
    await expect(guard.canActivate(contextFor('profile', bearer(forged)))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const expired = await jwt.signAsync({ sub: 1, role: 'ADMIN', exp: Math.floor(Date.now() / 1000) - 10 });
    await expect(guard.canActivate(contextFor('profile', bearer(expired)))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unsigned token that claims alg none', async () => {
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: 1, role: 'ADMIN' })}.`;
    await expect(guard.canActivate(contextFor('profile', bearer(unsigned)))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('rejects a correctly signed token with an unknown role or a missing subject', async () => {
    const unknownRole = await jwt.signAsync({ sub: 1, role: 'BOSS' });
    const noSubject = await jwt.signAsync({ role: 'ADMIN' });
    await expect(guard.canActivate(contextFor('profile', bearer(unknownRole)))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    await expect(guard.canActivate(contextFor('profile', bearer(noSubject)))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('accepts a valid token and keeps only the subject and the role', async () => {
    const token = await jwt.signAsync({ sub: 7, role: 'PLANNER', isSuperUser: true });
    const request = bearer(token);
    await expect(guard.canActivate(contextFor('profile', request))).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 7, role: 'PLANNER' });
  });
});