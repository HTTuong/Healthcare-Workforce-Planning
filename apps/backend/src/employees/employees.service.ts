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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// "YYYY-MM-DD" -> Date at 00:00 UTC, or null. Rejects impossible dates such as 2026-02-31.
function parseValidUntil(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new BadRequestException('validUntil must be null or a date in YYYY-MM-DD format');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`validUntil ${value} is not a real calendar date`);
  }
  return date;
}

// A qualification with no expiry never expires. Otherwise it counts through the whole validUntil day (BR-H01).
export function isQualificationValid(validUntil: Date | null, today: Date = new Date()): boolean {
  if (validUntil === null) return true;
  return validUntil.toISOString().slice(0, 10) >= today.toISOString().slice(0, 10);
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.employee.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(id: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { qualifications: { include: { qualification: true } } }
    });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    const qualifications = employee.qualifications.map((link) => ({
      qualificationId: link.qualificationId,
      code: link.qualification.code,
      name: link.qualification.name,
      validUntil: link.validUntil,
      valid: isQualificationValid(link.validUntil)
    }));
    return { ...employee, qualifications };
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

    // PUT semantics: assigning the same qualification again only updates validUntil.
  async assignQualification(employeeId: number, qualificationId: number, validUntilInput: unknown) {
    const validUntil = parseValidUntil(validUntilInput);
    try {
      const link = await this.prisma.employeeQualification.upsert({
        where: { employeeId_qualificationId: { employeeId, qualificationId } },
        create: { employeeId, qualificationId, validUntil },
        update: { validUntil }
      });
      return { ...link, valid: isQualificationValid(link.validUntil) };
    } catch (error) {
      throw this.translate(error, 'Conflict', `Employee ${employeeId} or qualification ${qualificationId} not found`);
    }
  }

  async removeQualification(employeeId: number, qualificationId: number) {
    try {
      await this.prisma.employeeQualification.delete({
        where: { employeeId_qualificationId: { employeeId, qualificationId } }
      });
    } catch (error) {
      throw this.translate(error, 'Conflict', `Employee ${employeeId} does not have qualification ${qualificationId}`);
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