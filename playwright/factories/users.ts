import type { Role } from '../api/types';
import { env } from '../utils/env';

// One fixed account per role for the tests to sign in with. The setup project creates them, or resets their role,
// state and password, before any test runs. The admin is the account from the environment.

export interface TestUser {
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
}

export const TEST_USERS: Record<Exclude<Role, 'ADMIN'>, TestUser> = {
  PLANNER: { role: 'PLANNER', email: 'pw.planner@example.com', firstName: 'Pia', lastName: 'Planner' },
  MANAGER: { role: 'MANAGER', email: 'pw.manager@example.com', firstName: 'Mikko', lastName: 'Manager' },
  EMPLOYEE: { role: 'EMPLOYEE', email: 'pw.employee@example.com', firstName: 'Noora', lastName: 'Nurse' }
};

/** The email and password to sign in with for a role. */
export function credentials(role: Role): { email: string; password: string } {
  if (role === 'ADMIN') return { email: env.adminEmail, password: env.adminPassword };
  return { email: TEST_USERS[role].email, password: env.testPassword };
}
