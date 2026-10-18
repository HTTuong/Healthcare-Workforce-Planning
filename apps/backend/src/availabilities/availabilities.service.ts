import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const TYPES = ['AVAILABLE', 'UNAVAILABLE', 'LEAVE'] as const;
type AvailabilityKind = (typeof TYPES)[number];

// An explicit UTC offset is mandatory, so "08:00" can never mean two different instants (R-TIME).
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export interface AvailabilityInput {
  employeeId?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  type?: unknown;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
}

function parseInstant(value: unknown, field: string): Date {
  const message = `${field} must be an ISO 8601 timestamp with an offset, for example 2026-10-25T08:00:00+02:00`;
  if (typeof value !== 'string' || !INSTANT_PATTERN.test(value)) throw new BadRequestException(message);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(message);
  return date;
}

function parseType(value: unknown): AvailabilityKind {
  if (typeof value !== 'string' || !(TYPES as readonly string[]).includes(value)) {
    throw new BadRequestException(`type must be one of ${TYPES.join(', ')}`);
  }
  return value as AvailabilityKind;
}

function assertRange(startsAt: Date, endsAt: Date) {
  if (startsAt.getTime() >= endsAt.getTime()) {
    throw new BadRequestException('endsAt must be later than startsAt');
  }
}

@Injectable()
export class AvailabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(employeeId?: number) {
    return this.prisma.availability.findMany({
      where: employeeId === undefined ? {} : { employeeId },
      orderBy: { startsAt: 'asc' }
    });
  }

  async create(input: AvailabilityInput) {
    if (!Number.isInteger(input.employeeId)) throw new BadRequestException('employeeId must be an integer');
    const employeeId = input.employeeId as number;
    const startsAt = parseInstant(input.startsAt, 'startsAt');
    const endsAt = parseInstant(input.endsAt, 'endsAt');
    const type = parseType(input.type);
    assertRange(startsAt, endsAt);
    await this.assertNoConflict(employeeId, startsAt, endsAt);
    try {
      return await this.prisma.availability.create({ data: { employeeId, startsAt, endsAt, type } });
    } catch (error) {
      if (errorCode(error) === 'P2003') throw new NotFoundException(`Employee ${employeeId} not found`);
      throw error;
    }
  }

  async update(id: number, input: AvailabilityInput) {
    const existing = await this.prisma.availability.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Availability ${id} not found`);
    // Fields that are not sent keep their stored value. The owner of a record cannot change.
    const startsAt = input.startsAt === undefined ? existing.startsAt : parseInstant(input.startsAt, 'startsAt');
    const endsAt = input.endsAt === undefined ? existing.endsAt : parseInstant(input.endsAt, 'endsAt');
    const type = input.type === undefined ? existing.type : parseType(input.type);
    assertRange(startsAt, endsAt);
    await this.assertNoConflict(existing.employeeId, startsAt, endsAt, id);
    return this.prisma.availability.update({ where: { id }, data: { startsAt, endsAt, type } });
  }

  async remove(id: number) {
    try {
      await this.prisma.availability.delete({ where: { id } });
    } catch (error) {
      if (errorCode(error) === 'P2025') throw new NotFoundException(`Availability ${id} not found`);
      throw error;
    }
  }

  // Two ranges overlap when each one starts before the other ends. Touching ranges do not overlap.
  // Check-then-insert is not atomic, so two parallel requests can both pass (R-CONC, pinned for a later lesson).
  private async assertNoConflict(employeeId: number, startsAt: Date, endsAt: Date, excludeId?: number) {
    const clash = await this.prisma.availability.findFirst({
      where: {
        employeeId,
        ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt }
      }
    });
    if (clash) {
      throw new ConflictException(
        `Overlaps availability ${clash.id} (${clash.startsAt.toISOString()} to ${clash.endsAt.toISOString()})`
      );
    }
  }
}