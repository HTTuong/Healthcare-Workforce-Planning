import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Prisma error code for a unique constraint violation.
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
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
}
