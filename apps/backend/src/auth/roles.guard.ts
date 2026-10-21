import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthRequest, RoleName } from './auth.types.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;

    // Deny by default: an endpoint with no declared roles is closed, so a forgotten decorator cannot open it.
    const allowed = this.reflector.getAllAndOverride<RoleName[] | undefined>(ROLES_KEY, targets);
    if (!allowed || allowed.length === 0) throw new ForbiddenException('No role policy is declared for this endpoint');

    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    if (!user || !allowed.includes(user.role)) throw new ForbiddenException('Your role cannot do this');
    return true;
  }
}