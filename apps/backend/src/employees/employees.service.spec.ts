import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EmployeesService, isQualificationValid } from './employees.service.js';

function makeService() {
  const prisma = {
    employee: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    employeeQualification: { upsert: vi.fn(), delete: vi.fn() }
  };
  return { prisma, service: new EmployeesService(prisma as never) };
}

const valid = { firstName: 'Aino', lastName: 'Virtanen', email: 'Aino@Example.com' };

describe('isQualificationValid', () => {
  const today = new Date('2026-11-07T10:00:00Z');
  it('never expires without validUntil', () => expect(isQualificationValid(null, today)).toBe(true));
  it('is valid on the validUntil day itself', () =>
    expect(isQualificationValid(new Date('2026-11-07T00:00:00Z'), today)).toBe(true));
  it('is expired the day after validUntil', () =>
    expect(isQualificationValid(new Date('2026-11-06T00:00:00Z'), today)).toBe(false));
});

describe('EmployeesService', () => {
  it('creates an employee and normalizes the email to lower case', async () => {
    const { prisma, service } = makeService();
    prisma.employee.create.mockResolvedValue({ id: 1 });
    await service.create(valid);
    expect(prisma.employee.create).toHaveBeenCalledWith({
      data: { firstName: 'Aino', lastName: 'Virtanen', email: 'aino@example.com' }
    });
  });

  it('rejects an invalid email and an unknown role with 400', async () => {
    const { service } = makeService();
    await expect(service.create({ ...valid, email: 'not-an-email' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...valid, role: 'BOSS' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a duplicate email (P2002) to 409', async () => {
    const { prisma, service } = makeService();
    prisma.employee.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.create(valid)).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps an unknown department (P2003) to 404', async () => {
    const { prisma, service } = makeService();
    prisma.employee.create.mockRejectedValue({ code: 'P2003' });
    await expect(service.create({ ...valid, departmentId: 999 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when the employee does not exist', async () => {
    const { prisma, service } = makeService();
    prisma.employee.findUnique.mockResolvedValue(null);
    await expect(service.findOne(42)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('flags an expired qualification as not valid', async () => {
    const { prisma, service } = makeService();
    prisma.employee.findUnique.mockResolvedValue({
      id: 1,
      qualifications: [
        { qualificationId: 1, validUntil: new Date('2000-01-01T00:00:00Z'), qualification: { code: 'RN', name: 'Nurse' } },
        { qualificationId: 2, validUntil: null, qualification: { code: 'CPR', name: 'CPR' } }
      ]
    });
    const result = await service.findOne(1);
    expect(result.qualifications.map((q) => q.valid)).toEqual([false, true]);
  });

  it('rejects an impossible validUntil date', async () => {
    const { service } = makeService();
    await expect(service.assignQualification(1, 1, '2026-02-31')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.assignQualification(1, 1, '07/11/2026')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts a qualification so assigning twice is idempotent', async () => {
    const { prisma, service } = makeService();
    prisma.employeeQualification.upsert.mockResolvedValue({ employeeId: 1, qualificationId: 2, validUntil: null });
    await service.assignQualification(1, 2, undefined);
    expect(prisma.employeeQualification.upsert).toHaveBeenCalledWith({
      where: { employeeId_qualificationId: { employeeId: 1, qualificationId: 2 } },
      create: { employeeId: 1, qualificationId: 2, validUntil: null },
      update: { validUntil: null }
    });
  });

  it('answers 404 when removing a qualification the employee does not have', async () => {
    const { prisma, service } = makeService();
    prisma.employeeQualification.delete.mockRejectedValue({ code: 'P2025' });
    await expect(service.removeQualification(1, 2)).rejects.toBeInstanceOf(NotFoundException);
  });
});