import type { ApiClient } from '../api/ApiClient';
import type { AvailabilityType, Department, Employee, Qualification, Role } from '../api/types';
import { uniqueEmail } from '../utils/unique';
import { personName } from './names';

export interface EmployeeOptions {
  role?: Role;
  department?: Department | null;
  contractMinutesPerWeek?: number;
  active?: boolean;
}

export interface EligibleOptions {
  department: Department;
  /** Qualifications the employee holds, valid without an expiry date. */
  qualifications?: Qualification[];
  contractMinutesPerWeek?: number;
}

/**
 * Employees by what they mean for the scheduling engine. The name of each method is the business situation, so a
 * test reads as "an eligible nurse and an unavailable nurse", and how that situation is built lives in one place.
 * Everything goes through the API as an admin, as a real admin would do it.
 */
export class EmployeeFactory {
  constructor(private readonly admin: ApiClient) {}

  /** Any employee. Defaults: role EMPLOYEE, no department, a full-time contract of 38 h 15 min, active. */
  async create(options: EmployeeOptions = {}): Promise<Employee> {
    const employee = await this.admin.employees.create({
      ...personName(),
      email: uniqueEmail(),
      role: options.role ?? 'EMPLOYEE',
      departmentId: options.department?.id ?? null,
      contractMinutesPerWeek: options.contractMinutesPerWeek ?? 2295
    });
    // The API creates employees active. Deactivation is a separate change, as for a real employee who leaves.
    return options.active === false ? this.admin.employees.update(employee.id, { active: false }) : employee;
  }

  /** Can work any shift of the department that needs only these qualifications (BR-H01, BR-H02, BR-H07). */
  async createEligibleEmployee(options: EligibleOptions): Promise<Employee> {
    const employee = await this.create({ department: options.department, contractMinutesPerWeek: options.contractMinutesPerWeek });
    for (const qualification of options.qualifications ?? []) {
      await this.admin.employees.assignQualification(employee.id, qualification.id, null);
    }
    return employee;
  }

  /** Eligible, but marked unavailable for the given time (BR-H02). */
  createUnavailableEmployee(options: EligibleOptions & { from: string; to: string }): Promise<Employee> {
    return this.withAvailability(options, 'UNAVAILABLE');
  }

  /** Eligible, but on leave for the given time (BR-H02). */
  createEmployeeOnLeave(options: EligibleOptions & { from: string; to: string }): Promise<Employee> {
    return this.withAvailability(options, 'LEAVE');
  }

  /** Eligible, and would like to work the given time (BR-S01). */
  createEmployeePreferring(options: EligibleOptions & { from: string; to: string }): Promise<Employee> {
    return this.withAvailability(options, 'AVAILABLE');
  }

  /** In the department, but holds the qualification only until a date that has passed (BR-H01). */
  async createEmployeeWithExpiredQualification(options: {
    department: Department;
    qualification: Qualification;
    validUntil: string;
  }): Promise<Employee> {
    const employee = await this.create({ department: options.department });
    await this.admin.employees.assignQualification(employee.id, options.qualification.id, options.validUntil);
    return employee;
  }

  /** In the department but deactivated: never scheduled and cannot sign in (BR-H07, F-04). */
  createInactiveEmployee(options: { department: Department }): Promise<Employee> {
    return this.create({ department: options.department, active: false });
  }

  private async withAvailability(options: EligibleOptions & { from: string; to: string }, type: AvailabilityType) {
    const employee = await this.createEligibleEmployee(options);
    await this.admin.availability.create({ employeeId: employee.id, type, startsAt: options.from, endsAt: options.to });
    return employee;
  }
}
