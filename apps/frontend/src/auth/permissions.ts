import type { Role } from './types';

const ANY: readonly Role[] = ['ADMIN', 'PLANNER', 'MANAGER', 'EMPLOYEE'];
const STAFF: readonly Role[] = ['ADMIN', 'PLANNER', 'MANAGER'];
const SCHEDULING: readonly Role[] = ['ADMIN', 'PLANNER'];
const APPROVAL: readonly Role[] = ['ADMIN', 'MANAGER'];

interface Permission {
  /** The roles that have it. */
  roles: readonly Role[];
  /** The API routes the UI uses for it. permissions.contract.test.ts checks them against the API's role table. */
  api: readonly string[];
}

/**
 * Every role check of the UI, in one table that mirrors the permission table in docs/architecture.md. The UI uses it
 * only to hide what a role cannot use. The API enforces every rule itself (R-CONS-01).
 */
export const PERMISSIONS = {
  'employees.read': { roles: STAFF, api: ['GET /employees', 'GET /employees/:id'] },
  'employees.manage': { roles: ['ADMIN'], api: ['POST /employees', 'PATCH /employees/:id', 'PUT /auth/password/:employeeId'] },
  'shifts.read': { roles: STAFF, api: ['GET /shifts', 'GET /shifts/:id'] },
  'shifts.manage': {
    roles: SCHEDULING,
    api: [
      'POST /shifts',
      'PATCH /shifts/:id',
      'DELETE /shifts/:id',
      'PUT /shifts/:id/requirements/:qualificationId',
      'DELETE /shifts/:id/requirements/:qualificationId'
    ]
  },
  'availability.own': {
    roles: ANY,
    api: ['GET /availabilities', 'POST /availabilities', 'PATCH /availabilities/:id', 'DELETE /availabilities/:id']
  },
  'schedules.read': { roles: ANY, api: ['GET /schedules', 'GET /schedules/:id'] },
  'schedules.check': { roles: STAFF, api: ['GET /schedules/:id/check'] },
  'schedules.manage': {
    roles: SCHEDULING,
    api: [
      'POST /schedules',
      'DELETE /schedules/:id',
      'POST /schedules/:id/generate',
      'POST /schedules/:id/assignments',
      'DELETE /schedules/:id/assignments/:assignmentId',
      'POST /schedules/:id/submit'
    ]
  },
  // The workflow buttons come from the API's actions field. This entry keeps the UI's idea of who decides in step.
  'schedules.decide': { roles: APPROVAL, api: ['POST /schedules/:id/approve', 'POST /schedules/:id/reject', 'POST /schedules/:id/publish'] }
} as const satisfies Record<string, Permission>;

export type PermissionName = keyof typeof PERMISSIONS;

export function can(role: Role, permission: PermissionName): boolean {
  return (PERMISSIONS[permission].roles as readonly Role[]).includes(role);
}
