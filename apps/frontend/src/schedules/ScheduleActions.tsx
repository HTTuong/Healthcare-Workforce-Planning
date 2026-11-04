import { useState } from 'react';

export type WorkflowAction = 'generate' | 'submit' | 'approve' | 'reject' | 'publish';

interface ActionInfo {
  label: string;
  help: string;
  primary?: boolean;
  /** A question asked before the action, for the steps that are hard to undo. */
  confirm?: string;
}

export const ACTIONS: Record<WorkflowAction, ActionInfo> = {
  generate: { label: 'Generate', help: 'The engine fills the open places. Assignments made by hand are kept.', primary: true },
  submit: { label: 'Submit for review', help: 'Sends the schedule to a manager. It cannot be changed while it is in review.', primary: true },
  approve: { label: 'Approve', help: 'Possible only when no hard rule is broken (BR-W03).', primary: true },
  reject: {
    label: 'Send back to draft',
    help: 'The planner can then change it and generate again.',
    confirm: 'Send this schedule back to draft?'
  },
  publish: {
    label: 'Publish',
    help: 'Employees see their shifts. A published schedule cannot be changed.',
    primary: true,
    confirm: 'Publish this schedule to the employees? It cannot be changed afterwards.'
  }
};

const ORDER: WorkflowAction[] = ['generate', 'submit', 'approve', 'publish', 'reject'];

/**
 * The workflow buttons. Which ones appear comes from the API (the actions field of GET /schedules/:id), which
 * reads the same table as the permission check, so the UI never offers a step the API would refuse for this role
 * and status.
 */
export function ScheduleActions({
  actions,
  busy,
  onAction
}: {
  actions: readonly string[];
  busy: boolean;
  onAction: (action: WorkflowAction) => void;
}) {
  const [confirming, setConfirming] = useState<WorkflowAction | null>(null);
  const available = ORDER.filter((action) => actions.includes(action));
  if (available.length === 0) return null;

  if (confirming) {
    return (
      <div className="panel action-bar" role="group" aria-label="Confirm">
        <p>{ACTIONS[confirming].confirm}</p>
        <div className="actions">
          <button
            type="button"
            className={confirming === 'reject' ? 'secondary' : 'primary'}
            disabled={busy}
            onClick={() => {
              setConfirming(null);
              onAction(confirming);
            }}
          >
            Yes, {ACTIONS[confirming].label.toLowerCase()}
          </button>
          <button type="button" className="secondary" onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel action-bar" role="group" aria-label="Workflow">
      {available.map((action) => (
        <div key={action} className="action">
          <button
            type="button"
            className={ACTIONS[action].primary ? 'primary' : 'secondary'}
            disabled={busy}
            aria-describedby={`action-${action}-help`}
            onClick={() => (ACTIONS[action].confirm ? setConfirming(action) : onAction(action))}
          >
            {ACTIONS[action].label}
          </button>
          <span className="hint-inline" id={`action-${action}-help`}>
            {ACTIONS[action].help}
          </span>
        </div>
      ))}
    </div>
  );
}
