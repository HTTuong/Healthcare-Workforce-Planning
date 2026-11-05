import { expect } from '@playwright/test';
import type { ApiClient } from '../api/ApiClient';
import type { Department, GenerateResult, Schedule } from '../api/types';
import { addDays } from '../utils/helsinki';

export interface PeriodOptions {
  department: Department;
  /** The first day, YYYY-MM-DD. */
  start: string;
  /** Days in the period, 7 by default. */
  days?: number;
}

/**
 * Schedules at any step of the workflow, reached the way the product reaches them: the planner creates, generates and
 * submits, the manager approves and publishes. A schedule that cannot reach the step asked for fails the setup with
 * the API's reason, instead of a test running on the wrong data.
 */
export class ScheduleFactory {
  constructor(
    private readonly planner: ApiClient,
    private readonly manager: ApiClient
  ) {}

  /** A DRAFT. */
  create(options: PeriodOptions): Promise<Schedule> {
    return this.planner.schedules.create({
      departmentId: options.department.id,
      periodStart: options.start,
      periodEnd: addDays(options.start, (options.days ?? 7) - 1)
    });
  }

  /** OPTIMIZED: created and generated. Returns what the engine added and the violations it left. */
  async createGenerated(options: PeriodOptions): Promise<GenerateResult> {
    const schedule = await this.create(options);
    return this.planner.schedules.generate(schedule.id);
  }

  /** REVIEW: generated and submitted. Violations are allowed here, so a test can check that approval refuses them. */
  async createInReview(options: PeriodOptions): Promise<GenerateResult> {
    const generated = await this.createGenerated(options);
    await this.planner.schedules.step(generated.schedule.id, 'submit');
    return generated;
  }

  /** APPROVED. The generated schedule must break no hard rule. */
  async createApproved(options: PeriodOptions): Promise<GenerateResult> {
    const generated = await this.createInReview(options);
    expect(generated.violations, 'a schedule to approve must break no hard rule').toEqual([]);
    await this.manager.schedules.step(generated.schedule.id, 'approve');
    return generated;
  }

  /** PUBLISHED: what employees see. */
  async createPublished(options: PeriodOptions): Promise<GenerateResult> {
    const approved = await this.createApproved(options);
    await this.manager.schedules.step(approved.schedule.id, 'publish');
    return approved;
  }
}
