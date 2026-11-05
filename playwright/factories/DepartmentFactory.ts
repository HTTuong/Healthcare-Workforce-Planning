import type { ApiClient } from '../api/ApiClient';
import type { Department } from '../api/types';
import { uniqueId } from '../utils/unique';

/**
 * Every test gets its own department. Shifts, schedules and the engine's candidates are all per department, so a
 * test that owns its department cannot be disturbed by another test running at the same time.
 */
export class DepartmentFactory {
  constructor(private readonly admin: ApiClient) {}

  create(name?: string): Promise<Department> {
    const id = uniqueId();
    return this.admin.departments.create({ code: `PW-${id}`, name: name ?? `Test ward ${id}` });
  }
}
