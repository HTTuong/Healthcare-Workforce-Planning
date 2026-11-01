import type { RoleName } from '../auth/auth.types.js';
import { APPROVAL_ROLES, SCHEDULING_ROLES } from '../auth/role-sets.js';

// The approval workflow of a schedule (docs/architecture.md, "Schedule workflow"), written once as data.
// The controller takes its @Roles from this table and the service its allowed statuses, so the diagram, the
// permission check and the status check cannot drift apart.

export const SCHEDULE_STATUSES = ['DRAFT', 'OPTIMIZED', 'REVIEW', 'APPROVED', 'PUBLISHED'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const WORKFLOW_ACTIONS = ['generate', 'edit', 'submit', 'approve', 'reject', 'publish'] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

export interface Transition {
  /** Statuses the action starts from. */
  readonly from: readonly ScheduleStatus[];
  /** Status after the action. */
  readonly to: ScheduleStatus;
  /** Roles allowed to take the action. */
  readonly roles: readonly RoleName[];
}

export const WORKFLOW: Readonly<Record<WorkflowAction, Transition>> = {
  // The engine fills the schedule around the assignments made by hand.
  generate: { from: ['DRAFT'], to: 'OPTIMIZED', roles: SCHEDULING_ROLES },
  // Adding or removing an assignment by hand (BR-W01). The schedule must then be generated again before review.
  edit: { from: ['DRAFT', 'OPTIMIZED'], to: 'DRAFT', roles: SCHEDULING_ROLES },
  submit: { from: ['OPTIMIZED'], to: 'REVIEW', roles: SCHEDULING_ROLES },
  // Only without hard violations (BR-W03). The service checks that, because it needs the data.
  approve: { from: ['REVIEW'], to: 'APPROVED', roles: APPROVAL_ROLES },
  reject: { from: ['REVIEW'], to: 'DRAFT', roles: APPROVAL_ROLES },
  // Only after approval (BR-W02). PUBLISHED is final.
  publish: { from: ['APPROVED'], to: 'PUBLISHED', roles: APPROVAL_ROLES }
};

/** The status after the action, or undefined when the action is not allowed from this status. */
export function nextStatus(status: ScheduleStatus, action: WorkflowAction): ScheduleStatus | undefined {
  const transition = WORKFLOW[action];
  return transition.from.includes(status) ? transition.to : undefined;
}

/** BR-W01: only DRAFT and OPTIMIZED schedules can be changed. */
export function isEditable(status: ScheduleStatus): boolean {
  return nextStatus(status, 'edit') !== undefined;
}

/** The actions this role may take on a schedule in this status, for example to show the right buttons. */
export function allowedActions(status: ScheduleStatus, role: RoleName): WorkflowAction[] {
  return WORKFLOW_ACTIONS.filter((action) => nextStatus(status, action) !== undefined && WORKFLOW[action].roles.includes(role));
}
