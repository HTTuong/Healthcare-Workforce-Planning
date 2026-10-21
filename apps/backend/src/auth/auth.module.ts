import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { RolesGuard } from './roles.guard.js';

function requireJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  // Fail at startup instead of running with a missing or guessable secret.
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters long');
  return secret;
}

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: requireJwtSecret(), signOptions: { algorithm: 'HS256', expiresIn: '8h' } })
    })
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Guards run in the order they are declared: who are you first, then what may you do.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard }
  ]
})
export class AuthModule {}