import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const ROLES = ['ADMIN', 'PLANNER', 'MANAGER', 'EMPLOYEE'] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmployeeInput {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  role?: unknown;
  departmentId?: unknown;
  contractMinutesPerWeek?: unknown;
  active?: unknown;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }
  return value.trim();
}

// Validates the fields that are present. When `partial` is false, the required ones must be present.
function parseEmployee(input: EmployeeInput, partial: boolean) {
  const data: Record<string, unknown> = {};
  if (!partial || input.firstName !== undefined) data['firstName'] = requireText(input.firstName, 'firstName');
  if (!partial || input.lastName !== undefined) data['lastName'] = requireText(input.lastName, 'lastName');
  if (!partial || input.email !== undefined) {
    const email = requireText(input.email, 'email').toLowerCase();
    if (!EMAIL_PATTERN.test(email)) throw new BadRequestException('email is not a valid address');
    data['email'] = email;
  }
  if (input.role !== undefined) {
    if (typeof input.role !== 'string' || !(ROLES as readonly string[]).includes(input.role)) {
      throw new BadRequestException(`role must be one of ${ROLES.join(', ')}`);
    }
    data['role'] = input.role;
  }
  if (input.departmentId !== undefined) {
    if (input.departmentId !== null && !Number.isInteger(input.departmentId)) {
      throw new BadRequestException('departmentId must be an integer or null');
    }
    data['departmentId'] = input.departmentId;
  }
  if (input.contractMinutesPerWeek !== undefined) {
    const minutes = input.contractMinutesPerWeek;
    if (!Number.isInteger(minutes) || (minutes as number) < 0 || (minutes as number) > 10080) {
      throw new BadRequestException('contractMinutesPerWeek must be an integer between 0 and 10080');
    }
    data['contractMinutesPerWeek'] = minutes;
  }
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw new BadRequestException('active must be a boolean');
    data['active'] = input.active;
  }
  return data;
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.employee.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(id: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async create(input: EmployeeInput) {
    const data = parseEmployee(input, false);
    try {
      return await this.prisma.employee.create({ data: data as never });
    } catch (error) {
      throw this.translate(error, `Email ${String(data['email'])} is already used`);
    }
  }

  async update(id: number, input: EmployeeInput) {
    const data = parseEmployee(input, true);
    if (Object.keys(data).length === 0) throw new BadRequestException('No updatable fields were provided');
    try {
      return await this.prisma.employee.update({ where: { id }, data: data as never });
    } catch (error) {
      throw this.translate(error, `Email ${String(data['email'])} is already used`, `Employee ${id} not found`);
    }
  }

  // P2002 unique violation -> 409, P2003 foreign key / P2025 record missing -> 404.
  private translate(error: unknown, conflictMessage: string, notFoundMessage = 'Referenced record not found'): unknown {
    const code = errorCode(error);
    if (code === 'P2002') return new ConflictException(conflictMessage);
    if (code === 'P2003' || code === 'P2025') return new NotFoundException(notFoundMessage);
    return error;
  }
}