import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AvailabilityScope {
  employeeId?: number;
  departmentId?: number;
}

// Ownership rules for availability (BR-A03). Roles are already checked by RolesGuard before this runs.
@Injectable()
export class AvailabilityAccess {
  constructor(private readonly prisma: PrismaService) {}

  // Writes: an admin may change anyone's availability, every other role only its own.
  assertCanWriteFor(user: AuthUser, employeeId: unknown) {
    if (user.role !== 'ADMIN' && employeeId !== user.sub) {
      throw new ForbiddenException('You can only change your own availability');
    }
  }

  // A missing record is left to the service, which answers 404.
  async assertCanChangeRecord(user: AuthUser, id: number) {
    if (user.role === 'ADMIN') return;
    const record = await this.prisma.availability.findUnique({ where: { id }, select: { employeeId: true } });
    if (record) this.assertCanWriteFor(user, record.employeeId);
  }

  // Reads: returns the filter this user is allowed to see.
  async readScope(user: AuthUser, requestedEmployeeId?: number): Promise<AvailabilityScope> {
    if (user.role === 'ADMIN') return { employeeId: requestedEmployeeId };
    if (user.role === 'EMPLOYEE') {
      if (requestedEmployeeId !== undefined && requestedEmployeeId !== user.sub) {
        throw new ForbiddenException('You can only see your own availability');
      }
      return { employeeId: user.sub };
    }
    // Planner and manager see their own department. Without a department they see only their own records.
    const me = await this.prisma.employee.findUnique({ where: { id: user.sub }, select: { departmentId: true } });
    if (!me?.departmentId) return { employeeId: user.sub };
    return { employeeId: requestedEmployeeId, departmentId: me.departmentId };
  }
}
