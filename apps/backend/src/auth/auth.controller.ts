import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { AuthRequest } from './auth.types.js';
import { Public } from './public.decorator.js';
import { ANY_ROLE } from './role-sets.js';
import { Roles } from './roles.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: { email?: unknown; password?: unknown }) {
    return this.authService.login(body?.email, body?.password);
  }

  @Roles(...ANY_ROLE)
  @Get('me')
  me(@Req() request: AuthRequest) {
    return request.user;
  }

  @Roles('ADMIN')
  @Put('password/:employeeId')
  @HttpCode(204)
  setPassword(@Param('employeeId', ParseIntPipe) employeeId: number, @Body() body: { password?: unknown }) {
    return this.authService.setPassword(employeeId, body?.password);
  }
}