import type { Role } from '../auth/types';

/** GET /employees and GET /employees/:id */
export interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  departmentId: number | null;
  contractMinutesPerWeek: number;
  active: boolean;
}

/** GET /departments */
export interface Department {
  id: number;
  code: string;
  name: string;
}

/** The body of POST /employees and PATCH /employees/:id */
export interface EmployeeBody {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  departmentId: number | null;
  contractMinutesPerWeek: number;
  active?: boolean;
}
