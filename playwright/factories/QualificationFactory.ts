import type { ApiClient } from '../api/ApiClient';
import type { Qualification } from '../api/types';
import { uniqueId } from '../utils/unique';

/** A new qualification per call, so one test's requirement never matches another test's employees. */
export class QualificationFactory {
  constructor(private readonly admin: ApiClient) {}

  create(name = 'Medication permit'): Promise<Qualification> {
    return this.admin.qualifications.create({ code: `PW-${uniqueId()}`, name });
  }
}
