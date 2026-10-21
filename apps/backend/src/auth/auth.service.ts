import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

// A real hash that matches nothing. Unknown emails are checked against it so the response time is the same.
const dummyHash = hashPassword('not-a-real-password');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async login(emailInput: unknown, passwordInput: unknown) {
    if (typeof emailInput !== 'string' || typeof passwordInput !== 'string' || emailInput === '' || passwordInput === '') {
      throw new BadRequestException('email and password are required');
    }
    const employee = await this.prisma.employee.findUnique({
      where: { email: emailInput.trim().toLowerCase() },
      // The client hides the hash by default. This is the only query that asks for it.
      omit: { passwordHash: false }
    });
    const matches = await verifyPassword(passwordInput, employee?.passwordHash ?? (await dummyHash));
    if (!employee || !employee.passwordHash || !employee.active || !matches) {
      // One message for every cause, so the response does not tell which emails exist.
      throw new UnauthorizedException('Invalid email or password');
    }
    return { accessToken: await this.jwt.signAsync({ sub: employee.id, role: employee.role }) };
  }

  async setPassword(employeeId: number, passwordInput: unknown) {
    if (
      typeof passwordInput !== 'string' ||
      passwordInput.length < MIN_PASSWORD_LENGTH ||
      passwordInput.length > MAX_PASSWORD_LENGTH
    ) {
      throw new BadRequestException(`password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`);
    }
    try {
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: { passwordHash: await hashPassword(passwordInput) }
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025') {
        throw new NotFoundException(`Employee ${employeeId} not found`);
      }
      throw error;
    }
  }
}