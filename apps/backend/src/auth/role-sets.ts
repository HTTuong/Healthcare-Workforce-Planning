import { ROLE_NAMES, type RoleName } from './auth.types.js';

// Role groups used by the @Roles decorators. The order matters for the role matrix test.
export const ANY_ROLE: RoleName[] = [...ROLE_NAMES];
export const STAFF_ROLES: RoleName[] = ['ADMIN', 'PLANNER', 'MANAGER'];
export const SCHEDULING_ROLES: RoleName[] = ['ADMIN', 'PLANNER'];