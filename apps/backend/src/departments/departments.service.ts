import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseNonEmptyText } from '../common/parse.js';

// Prisma error code for a unique constraint violation.
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

function isMissingRecord(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025';
}

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.department.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(id: number) {
    const department = await this.prisma.department.findUnique({ where: { id } });
    if (!department) {
      throw new NotFoundException(`Department ${id} not found`);
    }
    return department;
  }

  async create(code: string, name: string) {
    try {
      return await this.prisma.department.create({ data: { code, name } });
    } catch (error) {
      // Let the database decide uniqueness, and answer 409 instead of 500.
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Department code ${code} already exists`);
      }
      throw error;
    }
  }

    async update(id: number, input: { code?: unknown; name?: unknown }) {
    const data: { code?: string; name?: string } = {};
    if (input.code !== undefined) data.code = parseNonEmptyText(input.code, 'code');
    if (input.name !== undefined) data.name = parseNonEmptyText(input.name, 'name');
    if (Object.keys(data).length === 0) throw new BadRequestException('No updatable fields were provided');
    try {
      return await this.prisma.department.update({ where: { id }, data });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`Department code ${data.code} already exists`);
      if (isMissingRecord(error)) throw new NotFoundException(`Department ${id} not found`);
      throw error;
    }
  }

  // The schema cascades deletes to shifts and schedules, so a department that is still in use is refused.
  async remove(id: number) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { employees: true, shifts: true, schedules: true } } }
    });
    if (!department) throw new NotFoundException(`Department ${id} not found`);
    const { employees, shifts, schedules } = department._count;
    if (employees + shifts + schedules > 0) {
      throw new ConflictException(
        `Department ${id} is in use (${employees} employees, ${shifts} shifts, ${schedules} schedules)`
      );
    }
    await this.prisma.department.delete({ where: { id } });
  }
}
