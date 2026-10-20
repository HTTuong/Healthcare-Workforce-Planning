import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { parsePositiveInt } from '../common/parse.js';
import { PrismaService } from '../prisma/prisma.service.js';

const TYPES = ['MORNING', 'EVENING', 'NIGHT'] as const;
type ShiftKind = (typeof TYPES)[number];

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
}

function parseShiftType(value: string): ShiftKind {
  if (!(TYPES as readonly string[]).includes(value)) {
    throw new BadRequestException(`shift type must be one of ${TYPES.join(', ')}`);
  }
  return value as ShiftKind;
}

@Injectable()
export class StaffingRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(departmentId: number) {
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new NotFoundException(`Department ${departmentId} not found`);
    return this.prisma.staffingRequirement.findMany({ where: { departmentId }, orderBy: { shiftType: 'asc' } });
  }

  // PUT semantics: one row per department and shift type, so setting it again only changes the number.
  async set(departmentId: number, shiftTypeInput: string, minHeadcountInput: unknown) {
    const shiftType = parseShiftType(shiftTypeInput);
    const minHeadcount = parsePositiveInt(minHeadcountInput, 'minHeadcount');
    try {
      return await this.prisma.staffingRequirement.upsert({
        where: { departmentId_shiftType: { departmentId, shiftType } },
        create: { departmentId, shiftType, minHeadcount },
        update: { minHeadcount }
      });
    } catch (error) {
      if (errorCode(error) === 'P2003') throw new NotFoundException(`Department ${departmentId} not found`);
      throw error;
    }
  }

  async remove(departmentId: number, shiftTypeInput: string) {
    const shiftType = parseShiftType(shiftTypeInput);
    try {
      await this.prisma.staffingRequirement.delete({ where: { departmentId_shiftType: { departmentId, shiftType } } });
    } catch (error) {
      if (errorCode(error) === 'P2025') {
        throw new NotFoundException(`Department ${departmentId} has no ${shiftType} staffing requirement`);
      }
      throw error;
    }
  }
}