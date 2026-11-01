import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/auth.types.js';
import { AvailabilityAccess } from './availability-access.service.js';

function makeAccess() {
  const prisma = { availability: { findUnique: vi.fn() }, employee: { findUnique: vi.fn() } };
  return { prisma, access: new AvailabilityAccess(prisma as never) };
}

const admin: AuthUser = { sub: 1, role: 'ADMIN' };
const planner: AuthUser = { sub: 2, role: 'PLANNER' };
const employee: AuthUser = { sub: 4, role: 'EMPLOYEE' };

describe('AvailabilityAccess writes', () => {
  it('lets an admin write for anyone and every other role only for itself', () => {
    const { access } = makeAccess();
    expect(() => access.assertCanWriteFor(admin, 4)).not.toThrow();
    expect(() => access.assertCanWriteFor(employee, 4)).not.toThrow();
    expect(() => access.assertCanWriteFor(employee, 2)).toThrow(ForbiddenException);
    expect(() => access.assertCanWriteFor(planner, 4)).toThrow(ForbiddenException);
  });

  it('refuses an employee id that is missing or not a number for a non admin', () => {
    const { access } = makeAccess();
    expect(() => access.assertCanWriteFor(employee, undefined)).toThrow(ForbiddenException);
    expect(() => access.assertCanWriteFor(employee, '4')).toThrow(ForbiddenException);
  });

  it('checks the owner of an existing record', async () => {
    const { prisma, access } = makeAccess();
    prisma.availability.findUnique.mockResolvedValue({ employeeId: 2 });
    await expect(access.assertCanChangeRecord(employee, 9)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(access.assertCanChangeRecord(planner, 9)).resolves.toBeUndefined();
  });

  it('leaves a missing record to the service, which answers 404', async () => {
    const { prisma, access } = makeAccess();
    prisma.availability.findUnique.mockResolvedValue(null);
    await expect(access.assertCanChangeRecord(employee, 9)).resolves.toBeUndefined();
  });

  it('does not look up the record for an admin', async () => {
    const { prisma, access } = makeAccess();
    await access.assertCanChangeRecord(admin, 9);
    expect(prisma.availability.findUnique).not.toHaveBeenCalled();
  });
});

describe('AvailabilityAccess reads', () => {
  it('limits an employee to its own records and refuses anyone else', async () => {
    const { access } = makeAccess();
    await expect(access.readScope(employee)).resolves.toEqual({ employeeId: 4 });
    await expect(access.readScope(employee, 4)).resolves.toEqual({ employeeId: 4 });
    await expect(access.readScope(employee, 2)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('limits a planner to its own department', async () => {
    const { prisma, access } = makeAccess();
    prisma.employee.findUnique.mockResolvedValue({ departmentId: 3 });
    await expect(access.readScope(planner)).resolves.toEqual({ departmentId: 3 });
    await expect(access.readScope(planner, 7)).resolves.toEqual({ employeeId: 7, departmentId: 3 });
  });

  it('limits a planner without a department to its own records', async () => {
    const { prisma, access } = makeAccess();
    prisma.employee.findUnique.mockResolvedValue({ departmentId: null });
    await expect(access.readScope(planner, 7)).resolves.toEqual({ employeeId: 2 });
  });

  it('lets an admin see everything or one chosen employee', async () => {
    const { access } = makeAccess();
    await expect(access.readScope(admin)).resolves.toEqual({});
    await expect(access.readScope(admin, 7)).resolves.toEqual({ employeeId: 7 });
  });
});
