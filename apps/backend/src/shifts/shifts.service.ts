import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { parseInstant, parsePositiveInt } from '../common/parse.js';
import { PrismaService } from '../prisma/prisma.service.js';

const TYPES = ['MORNING', 'EVENING', 'NIGHT'] as const;
type ShiftKind = (typeof TYPES)[number];

export interface ShiftInput {
  departmentId?: unknown;
  type?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  requiredHeadcount?: unknown;
  requirements?: unknown;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
}

function parseType(value: unknown): ShiftKind {
  if (typeof value !== 'string' || !(TYPES as readonly string[]).includes(value)) {
    throw new BadRequestException(`type must be one of ${TYPES.join(', ')}`);
  }
  return value as ShiftKind;
}

function assertRange(startsAt: Date, endsAt: Date) {
  if (startsAt.getTime() >= endsAt.getTime()) {
    throw new BadRequestException('endsAt must be later than startsAt');
  }
}

// Each qualification count must fit in the headcount. The counts may add up to more than the headcount,
// because one employee can hold several qualifications.
function parseRequirements(value: unknown, headcount: number) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new BadRequestException('requirements must be an array');
  const seen = new Set<number>();
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new BadRequestException('each requirement must be an object');
    const entry = item as { qualificationId?: unknown; count?: unknown };
    const qualificationId = parsePositiveInt(entry.qualificationId, 'requirements.qualificationId');
    const count = entry.count === undefined ? 1 : parsePositiveInt(entry.count, 'requirements.count');
    if (count > headcount) {
      throw new BadRequestException(`requirement count ${count} exceeds requiredHeadcount ${headcount}`);
    }
    if (seen.has(qualificationId)) {
      throw new BadRequestException(`qualification ${qualificationId} appears more than once`);
    }
    seen.add(qualificationId);
    return { qualificationId, count };
  });
}

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(departmentId?: number) {
    return this.prisma.shift.findMany({
      where: departmentId === undefined ? {} : { departmentId },
      orderBy: { startsAt: 'asc' },
      include: { requirements: true }
    });
  }

  async findOne(id: number) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: { requirements: { include: { qualification: true } } }
    });
    if (!shift) throw new NotFoundException(`Shift ${id} not found`);
    return shift;
  }

  async create(input: ShiftInput) {
    const departmentId = parsePositiveInt(input.departmentId, 'departmentId');
    const type = parseType(input.type);
    const startsAt = parseInstant(input.startsAt, 'startsAt');
    const endsAt = parseInstant(input.endsAt, 'endsAt');
    const requiredHeadcount = parsePositiveInt(input.requiredHeadcount, 'requiredHeadcount');
    assertRange(startsAt, endsAt);
    const requirements = parseRequirements(input.requirements, requiredHeadcount);
    try {
      // Nested create: the shift and its requirements are written in one transaction.
      return await this.prisma.shift.create({
        data: { departmentId, type, startsAt, endsAt, requiredHeadcount, requirements: { create: requirements } },
        include: { requirements: true }
      });
    } catch (error) {
      if (errorCode(error) === 'P2003') throw new NotFoundException('Department or qualification not found');
      throw error;
    }
  }

  // The department of a shift cannot change. Fields that are not sent keep their stored value.
  async update(id: number, input: ShiftInput) {
    const existing = await this.prisma.shift.findUnique({ where: { id }, include: { requirements: true } });
    if (!existing) throw new NotFoundException(`Shift ${id} not found`);
    const type = input.type === undefined ? existing.type : parseType(input.type);
    const startsAt = input.startsAt === undefined ? existing.startsAt : parseInstant(input.startsAt, 'startsAt');
    const endsAt = input.endsAt === undefined ? existing.endsAt : parseInstant(input.endsAt, 'endsAt');
    const requiredHeadcount =
      input.requiredHeadcount === undefined
        ? existing.requiredHeadcount
        : parsePositiveInt(input.requiredHeadcount, 'requiredHeadcount');
    assertRange(startsAt, endsAt);
    const largest = Math.max(0, ...existing.requirements.map((requirement) => requirement.count));
    if (largest > requiredHeadcount) {
      throw new BadRequestException(`requiredHeadcount ${requiredHeadcount} is below an existing requirement count ${largest}`);
    }
    return this.prisma.shift.update({
      where: { id },
      data: { type, startsAt, endsAt, requiredHeadcount },
      include: { requirements: true }
    });
  }

  async remove(id: number) {
    try {
      await this.prisma.shift.delete({ where: { id } });
    } catch (error) {
      if (errorCode(error) === 'P2025') throw new NotFoundException(`Shift ${id} not found`);
      throw error;
    }
  }

  // PUT semantics: setting the same qualification again only changes its count.
  async setRequirement(shiftId: number, qualificationId: number, countInput: unknown) {
    const count = countInput === undefined ? 1 : parsePositiveInt(countInput, 'count');
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);
    if (count > shift.requiredHeadcount) {
      throw new BadRequestException(`count ${count} exceeds requiredHeadcount ${shift.requiredHeadcount}`);
    }
    try {
      return await this.prisma.shiftRequirement.upsert({
        where: { shiftId_qualificationId: { shiftId, qualificationId } },
        create: { shiftId, qualificationId, count },
        update: { count }
      });
    } catch (error) {
      if (errorCode(error) === 'P2003') throw new NotFoundException(`Qualification ${qualificationId} not found`);
      throw error;
    }
  }

  async removeRequirement(shiftId: number, qualificationId: number) {
    try {
      await this.prisma.shiftRequirement.delete({ where: { shiftId_qualificationId: { shiftId, qualificationId } } });
    } catch (error) {
      if (errorCode(error) === 'P2025') {
        throw new NotFoundException(`Shift ${shiftId} does not require qualification ${qualificationId}`);
      }
      throw error;
    }
  }
}