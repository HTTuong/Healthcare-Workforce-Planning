import type { ApiByRole } from '../api/ApiClient';
import { DepartmentFactory } from './DepartmentFactory';
import { EmployeeFactory } from './EmployeeFactory';
import { QualificationFactory } from './QualificationFactory';
import { ScheduleFactory } from './ScheduleFactory';
import { ShiftFactory } from './ShiftFactory';

export interface Factories {
  departments: DepartmentFactory;
  qualifications: QualificationFactory;
  employees: EmployeeFactory;
  shifts: ShiftFactory;
  schedules: ScheduleFactory;
}

/** Each factory acts as the role that does this in the product: admin, planner or manager. */
export function createFactories(api: ApiByRole): Factories {
  return {
    departments: new DepartmentFactory(api.ADMIN),
    qualifications: new QualificationFactory(api.ADMIN),
    employees: new EmployeeFactory(api.ADMIN),
    shifts: new ShiftFactory(api.PLANNER),
    schedules: new ScheduleFactory(api.PLANNER, api.MANAGER)
  };
}
