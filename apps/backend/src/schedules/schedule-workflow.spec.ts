import { describe, expect, it } from 'vitest';
import { ROLE_NAMES } from '../auth/auth.types.js';
import {
  allowedActions,
  isEditable,
  nextStatus,
  SCHEDULE_STATUSES,
  type ScheduleStatus,
  WORKFLOW,
  type WorkflowAction,
  WORKFLOW_ACTIONS
} from './schedule-workflow.js';

// The state diagram of docs/architecture.md, edge by edge. Every pair of status and action that is not listed here
// must be refused, so the test covers all 5 x 6 = 30 combinations.
const DIAGRAM: Array<[ScheduleStatus, WorkflowAction, ScheduleStatus]> = [
  ['DRAFT', 'generate', 'OPTIMIZED'],
  ['DRAFT', 'edit', 'DRAFT'],
  ['OPTIMIZED', 'edit', 'DRAFT'],
  ['OPTIMIZED', 'submit', 'REVIEW'],
  ['REVIEW', 'approve', 'APPROVED'],
  ['REVIEW', 'reject', 'DRAFT'],
  ['APPROVED', 'publish', 'PUBLISHED']
];

/** Statuses reachable from DRAFT, optionally without one action. */
function reachable(without?: WorkflowAction): Set<ScheduleStatus> {
  const seen = new Set<ScheduleStatus>(['DRAFT']);
  const queue: ScheduleStatus[] = ['DRAFT'];
  while (queue.length > 0) {
    const status = queue.shift()!;
    for (const action of WORKFLOW_ACTIONS) {
      if (action === without) continue;
      const next = nextStatus(status, action);
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe('schedule workflow transitions', () => {
  it('matches the state diagram for all 30 pairs of status and action', () => {
    for (const status of SCHEDULE_STATUSES) {
      for (const action of WORKFLOW_ACTIONS) {
        const edge = DIAGRAM.find(([from, via]) => from === status && via === action);
        expect(nextStatus(status, action), `${action} from ${status}`).toBe(edge?.[2]);
      }
    }
  });

  it('reaches every status from DRAFT', () => {
    expect([...reachable()].sort()).toEqual([...SCHEDULE_STATUSES].sort());
  });

  it('cannot reach PUBLISHED without approval (BR-W02, R-WF-01)', () => {
    expect(reachable('approve').has('PUBLISHED')).toBe(false);
    expect(reachable('approve').has('APPROVED')).toBe(false);
  });

  it('cannot reach review without the engine run, because a hand edit always goes back to DRAFT', () => {
    expect(reachable('generate').has('REVIEW')).toBe(false);
  });

  it('ends at PUBLISHED: no action leaves it', () => {
    expect(WORKFLOW_ACTIONS.filter((action) => nextStatus('PUBLISHED', action))).toEqual([]);
  });

  it('allows edits only in DRAFT and OPTIMIZED (BR-W01)', () => {
    expect(SCHEDULE_STATUSES.filter(isEditable)).toEqual(['DRAFT', 'OPTIMIZED']);
  });
});

describe('schedule workflow roles', () => {
  it('follows the permission table: planners build and submit, managers approve, reject and publish', () => {
    const table = Object.fromEntries(WORKFLOW_ACTIONS.map((action) => [action, [...WORKFLOW[action].roles].sort()]));
    expect(table).toEqual({
      generate: ['ADMIN', 'PLANNER'],
      edit: ['ADMIN', 'PLANNER'],
      submit: ['ADMIN', 'PLANNER'],
      approve: ['ADMIN', 'MANAGER'],
      reject: ['ADMIN', 'MANAGER'],
      publish: ['ADMIN', 'MANAGER']
    });
  });

  it('never lets an employee take an action', () => {
    for (const status of SCHEDULE_STATUSES) expect(allowedActions(status, 'EMPLOYEE'), status).toEqual([]);
  });

  it('lists the actions per status and role', () => {
    expect(allowedActions('DRAFT', 'PLANNER')).toEqual(['generate', 'edit']);
    expect(allowedActions('OPTIMIZED', 'PLANNER')).toEqual(['edit', 'submit']);
    expect(allowedActions('REVIEW', 'PLANNER')).toEqual([]);
    expect(allowedActions('REVIEW', 'MANAGER')).toEqual(['approve', 'reject']);
    expect(allowedActions('APPROVED', 'MANAGER')).toEqual(['publish']);
    expect(allowedActions('APPROVED', 'ADMIN')).toEqual(['publish']);
    for (const role of ROLE_NAMES) expect(allowedActions('PUBLISHED', role), role).toEqual([]);
  });
});
