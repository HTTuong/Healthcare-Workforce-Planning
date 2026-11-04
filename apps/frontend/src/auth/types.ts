export type Role = 'ADMIN' | 'PLANNER' | 'MANAGER' | 'EMPLOYEE';

/** GET /auth/me */
export interface Profile {
  sub: number;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  departmentId: number | null;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  PLANNER: 'Planner',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee'
};
