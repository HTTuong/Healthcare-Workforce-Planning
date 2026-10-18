import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

@Injectable()
export class QualificationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.qualification.findMany({ orderBy: { id: 'asc' } });
  }

  async create(code: unknown, name: unknown) {
    // The body is untrusted input, so check types before touching the database.
    if (typeof code !== 'string' || code.trim() === '' || typeof name !== 'string' || name.trim() === '') {
      throw new BadRequestException('code and name are required non-empty strings');
    }
    try {
      return await this.prisma.qualification.create({ data: { code: code.trim(), name: name.trim() } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Qualification code ${code} already exists`);
      }
      throw error;
    }
  }
}