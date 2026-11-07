import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { type AuthRequest, type AuthUser, ROLE_NAMES } from './auth.types.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * The header must be exactly "Bearer <token>" (RFC 6750). Splitting on spaces and taking two parts accepted
 * "Bearer <token> extra" too (F-15). The scheme stays case sensitive (F-10, accepted).
 */
function extractBearerToken(header: string | undefined): string | undefined {
  return /^Bearer ([^\s]+)$/.exec(header ?? '')?.[1];
}

// A correctly signed token is still rejected if its content is not what we issue.
function isAuthUser(payload: unknown): payload is AuthUser {
  if (typeof payload !== 'object' || payload === null) return false;
  const { sub, role } = payload as { sub?: unknown; role?: unknown };
  return Number.isInteger(sub) && typeof role === 'string' && (ROLE_NAMES as readonly string[]).includes(role);
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: unknown;
    try {
      // Only HS256 is accepted, so a token that claims "alg: none" or another algorithm is refused.
      payload = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!isAuthUser(payload)) throw new UnauthorizedException('Invalid token payload');

    request.user = { sub: payload.sub, role: payload.role };
    return true;
  }
}