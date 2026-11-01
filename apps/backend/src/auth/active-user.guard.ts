import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthRequest } from './auth.types.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

// A token stays valid for 8 hours, so the account itself is checked on every request (F-04).
// Runs after AuthGuard and before RolesGuard.
@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.user) throw new UnauthorizedException('No authenticated user');
    const employee = await this.prisma.employee.findUnique({
      where: { id: request.user.sub },
      select: { active: true, role: true }
    });
    // A deactivated or deleted account loses access at once, not when its token expires.
    if (!employee || !employee.active) throw new UnauthorizedException('This account is not active');
    // The role stored in the database wins over the role in the token, so a role change applies at once.
    request.user = { sub: request.user.sub, role: employee.role };
    return true;
  }
}
