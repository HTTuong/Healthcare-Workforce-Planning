import type { Role } from './types';

// The UI mirrors the permission table in docs/architecture.md to hide what a role cannot use. The API enforces it.
export const STAFF_ROLES: readonly Role[] = ['ADMIN', 'PLANNER', 'MANAGER'];

/** Admin, Planner and Manager may read the employee list. */
export function canViewEmployees(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

/** Only an admin manages employees. */
export function canManageEmployees(role: Role): boolean {
  return role === 'ADMIN';
}
