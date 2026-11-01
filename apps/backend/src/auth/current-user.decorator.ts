import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthRequest, AuthUser } from './auth.types.js';

// Gives a handler the user that AuthGuard attached to the request. Not meant for @Public routes.
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const user = context.switchToHttp().getRequest<AuthRequest>().user;
  if (!user) throw new UnauthorizedException('No authenticated user');
  return user;
});
