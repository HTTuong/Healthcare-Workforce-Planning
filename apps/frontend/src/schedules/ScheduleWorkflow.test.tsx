import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ADMIN, fakeApi, MANAGER, sent, signedInAs } from '../test/fake-api';
import { renderApp } from '../test/render-app';

const PLANNER = { ...ADMIN, sub: 2, role: 'PLANNER', firstName: 'Pia', lastName: 'Planner' };
const MORNING = {
  id: 1,
  departmentId: 3,
  type: 'MORNING',
  startsAt: '2026-10-19T04:00:00.000Z',
  endsAt: '2026-10-19T12:00:00.000Z',
  requiredHeadcount: 2,
  requirements: []
};
const noora = { id: 26, firstName: 'Noora', lastName: 'Nurse' };
const ASSIGNMENT = { id: 40, scheduleId: 5, shiftId: 1, employeeId: 26, shift: MORNING, employee: noora };
const schedule = (status: string, actions: string[], assignments = [ASSIGNMENT]) => ({
  id: 5,
  departmentId: 3,
  periodStart: '2026-10-19',
  periodEnd: '2026-10-25',
  status,
  qualityScore: 80,
  actions,
  assignments
});
const SHORT = { ruleId: 'BR-H06', shiftId: 1, message: 'Shift 1 has 1 of 2 required people' };
const check = (violations: object[] = []) => ({
  violations,
  scores: { preference: 100, fairness: 100, workload: 100, overtime: 100, quality: 100 }
});
const EMPLOYEES = [
  { id: 26, firstName: 'Noora', lastName: 'Nurse', email: 'n@example.com', role: 'EMPLOYEE', departmentId: 3, contractMinutesPerWeek: 2295, active: true },
  { id: 27, firstName: 'Niko', lastName: 'Night', email: 'k@example.com', role: 'EMPLOYEE', departmentId: 3, contractMinutesPerWeek: 2295, active: true },
  { id: 28, firstName: 'Ida', lastName: 'Inactive', email: 'i@example.com', role: 'EMPLOYEE', departmentId: 3, contractMinutesPerWeek: 2295, active: false },
  { id: 29, firstName: 'Olli', lastName: 'Other', email: 'o@example.com', role: 'EMPLOYEE', departmentId: 4, contractMinutesPerWeek: 2295, active: true }
];

/**
 * The fake API for schedule 5. Each GET of the schedule returns the next status in the list, so a test can follow
 * the schedule through the workflow.
 */
function api(profile: object, states: Array<ReturnType<typeof schedule>>, extra: Parameters<typeof fakeApi>[0] = {}, violations: object[] = []) {
  let reads = 0;
  return fakeApi({
    ...signedInAs(profile),
    'GET /api/schedules/5': () => ({ status: 200, body: states[Math.min(reads++, states.length - 1)] }),
    'GET /api/departments': { status: 200, body: [{ id: 3, code: 'W3B', name: 'Ward 3B' }] },
    'GET /api/shifts?departmentId=3': { status: 200, body: [MORNING] },
    'GET /api/schedules/5/check': { status: 200, body: check(violations) },
    'GET /api/employees': { status: 200, body: EMPLOYEES },
    ...extra
  });
}

const writes = (fetchMock: ReturnType<typeof fakeApi>) =>
  fetchMock.mock.calls
    .map((call) => `${(call[1] as RequestInit).method ?? 'GET'} ${String(call[0])}`)
    .filter((call) => !call.startsWith('GET'));

describe('workflow buttons', () => {
  it('offers exactly the actions the API lists for this role and status', async () => {
    api(PLANNER, [schedule('DRAFT', ['generate', 'edit'])]);
    renderApp('/schedules/5');
    const bar = await screen.findByRole('group', { name: 'Workflow' });
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Generate']);
    expect(screen.getByRole('button', { name: 'Generate' })).toHaveAccessibleDescription(
      'The engine fills the open places. Assignments made by hand are kept.'
    );
  });

  it('shows no workflow buttons when the API lists none', async () => {
    api(PLANNER, [schedule('REVIEW', [])]);
    renderApp('/schedules/5');
    await screen.findByRole('heading', { name: 'Shifts' });
    expect(screen.queryByRole('group', { name: 'Workflow' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Delete schedule' })).not.toBeInTheDocument();
  });

  it('generates, reports what was added and what is still broken, and reloads', async () => {
    const fetchMock = api(PLANNER, [schedule('DRAFT', ['generate', 'edit']), schedule('OPTIMIZED', ['edit', 'submit'])], {
      'POST /api/schedules/5/generate': { status: 200, body: { added: 3, violations: [SHORT] } }
    });
    renderApp('/schedules/5');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Generate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Generated: 3 assignments added. 1 hard rule violation remains, see the check below.');
    expect(await screen.findByText('Optimized')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual(['POST /api/schedules/5/generate']);
  });

  it('shows the violations when approval is refused (BR-W03)', async () => {
    api(MANAGER, [schedule('REVIEW', ['approve', 'reject'])], {
      'POST /api/schedules/5/approve': {
        status: 409,
        body: { statusCode: 409, message: 'Schedule 5 breaks 1 hard rule(s) and cannot be approved (BR-W03)', violations: [SHORT] }
      }
    }, [SHORT]);
    renderApp('/schedules/5');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Approve' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Schedule 5 breaks 1 hard rule(s) and cannot be approved (BR-W03)');
    expect(within(alert).getByText('Shift 1 has 1 of 2 required people')).toBeInTheDocument();
  });

  it('publishes only after confirmation', async () => {
    const fetchMock = api(MANAGER, [schedule('APPROVED', ['publish']), schedule('PUBLISHED', [])], {
      'POST /api/schedules/5/publish': { status: 200, body: {} }
    });
    renderApp('/schedules/5');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(screen.getByText('Publish this schedule to the employees? It cannot be changed afterwards.')).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(screen.getByRole('button', { name: 'Yes, publish' }));
    expect(await screen.findByText('Published. Employees can now see their shifts.')).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual(['POST /api/schedules/5/publish']);
    expect(await screen.findByText('Published', { selector: '.status-badge' })).toBeInTheDocument();
  });

  it('sends back to draft after confirmation', async () => {
    const fetchMock = api(MANAGER, [schedule('REVIEW', ['approve', 'reject']), schedule('DRAFT', [])], {
      'POST /api/schedules/5/reject': { status: 200, body: {} }
    });
    renderApp('/schedules/5');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Send back to draft' }));
    await user.click(screen.getByRole('button', { name: 'Yes, send back to draft' }));
    expect(await screen.findByText('Sent back to draft. The planner can change it and generate again.')).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual(['POST /api/schedules/5/reject']);
  });

  it('keeps the buttons disabled until the schedule is read again, so a step cannot be clicked twice', async () => {
    let reads = 0;
    let release!: () => void;
    const fetchMock = fakeApi({
      ...signedInAs(PLANNER),
      'GET /api/schedules/5': () =>
        ++reads === 1
          ? { status: 200, body: schedule('OPTIMIZED', ['edit', 'submit']) }
          : new Promise((resolve) => {
              release = () => resolve({ status: 200, body: schedule('REVIEW', []) });
            }),
      'GET /api/departments': { status: 200, body: [{ id: 3, code: 'W3B', name: 'Ward 3B' }] },
      'GET /api/shifts?departmentId=3': { status: 200, body: [MORNING] },
      'GET /api/schedules/5/check': { status: 200, body: check() },
      'GET /api/employees': { status: 200, body: EMPLOYEES },
      'POST /api/schedules/5/submit': { status: 200, body: {} }
    });
    renderApp('/schedules/5');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Submit for review' }));
    await screen.findByRole('button', { name: 'Submit for review' });
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
    expect(screen.queryByText(/^Submitted for review/)).not.toBeInTheDocument();
    release();
    expect(await screen.findByText(/^Submitted for review/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for review' })).not.toBeInTheDocument();
    expect(writes(fetchMock)).toEqual(['POST /api/schedules/5/submit']);
  });

  it('shows the API message when a parallel change wins', async () => {
    api(PLANNER, [schedule('OPTIMIZED', ['edit', 'submit'])], {
      'POST /api/schedules/5/submit': { status: 409, body: { statusCode: 409, message: 'Cannot submit schedule 5 while it is REVIEW: it must be OPTIMIZED' } }
    });
    renderApp('/schedules/5');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot submit schedule 5 while it is REVIEW');
  });
});

describe('hand edits', () => {
  it('adds an active employee of the department to a shift', async () => {
    const fetchMock = api(PLANNER, [schedule('OPTIMIZED', ['edit', 'submit'])], {
      'POST /api/schedules/5/assignments': { status: 201, body: {} }
    });
    renderApp('/schedules/5');
    const add = await screen.findByLabelText('Add a person to the Morning shift on Mon 19 Oct 2026');
    // Noora is already on the shift, Ida is inactive and Olli is in another department.
    expect(within(add).getAllByRole('option').map((o) => o.textContent)).toEqual(['Add…', 'Niko Night']);
    await userEvent.setup().selectOptions(add, 'Niko Night');
    await screen.findByRole('heading', { name: 'Shifts' });
    expect(writes(fetchMock)).toEqual(['POST /api/schedules/5/assignments']);
    const index = fetchMock.mock.calls.findIndex((call) => (call[1] as RequestInit).method === 'POST');
    expect(sent(fetchMock, index).body).toEqual({ shiftId: 1, employeeId: 27 });
  });

  it('removes a person by the assignment id', async () => {
    const fetchMock = api(PLANNER, [schedule('DRAFT', ['generate', 'edit'])], {
      'DELETE /api/schedules/5/assignments/40': { status: 204 }
    });
    renderApp('/schedules/5');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Remove Noora Nurse from the Morning shift on Mon 19 Oct 2026' }));
    await screen.findByRole('heading', { name: 'Shifts' });
    expect(writes(fetchMock)).toEqual(['DELETE /api/schedules/5/assignments/40']);
  });

  it('deletes an editable schedule after confirmation and returns to the list', async () => {
    const fetchMock = api(PLANNER, [schedule('DRAFT', ['generate', 'edit'])], {
      'DELETE /api/schedules/5': { status: 204 },
      'GET /api/schedules': { status: 200, body: [] }
    });
    renderApp('/schedules/5');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete schedule' }));
    expect(writes(fetchMock)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('The schedule was deleted.')).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual(['DELETE /api/schedules/5']);
  });

  it('does not read the employee list for a schedule that cannot be edited', async () => {
    const fetchMock = api(MANAGER, [schedule('REVIEW', ['approve', 'reject'])]);
    renderApp('/schedules/5');
    await screen.findByRole('heading', { name: 'Shifts' });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain('/api/employees');
  });
});

describe('new schedule', () => {
  const routes = () => ({
    ...signedInAs(PLANNER),
    'GET /api/departments': { status: 200, body: [{ id: 3, code: 'W3B', name: 'Ward 3B' }] }
  });

  it('creates a draft and opens it', async () => {
    const fetchMock = fakeApi({
      ...routes(),
      'POST /api/schedules': { status: 201, body: { id: 5 } },
      'GET /api/schedules/5': { status: 200, body: schedule('DRAFT', ['generate', 'edit'], []) },
      'GET /api/shifts?departmentId=3': { status: 200, body: [] },
      'GET /api/schedules/5/check': { status: 200, body: check() },
      'GET /api/employees': { status: 200, body: EMPLOYEES }
    });
    renderApp('/schedules/new');
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'Ward 3B' });
    await user.selectOptions(screen.getByLabelText('Department'), 'Ward 3B');
    await user.clear(screen.getByLabelText('First day'));
    await user.type(screen.getByLabelText('First day'), '2026-10-19');
    await user.clear(screen.getByLabelText('Last day'));
    await user.type(screen.getByLabelText('Last day'), '2026-10-25');
    expect(screen.getByText(/^7 days\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('The schedule was created as a draft. Generate it to fill the shifts.')).toBeInTheDocument();
    expect(sent(fetchMock, fetchMock.mock.calls.findIndex((call) => (call[1] as RequestInit).method === 'POST')).body).toEqual({
      departmentId: 3,
      periodStart: '2026-10-19',
      periodEnd: '2026-10-25'
    });
  });

  it('checks the department and the length before sending, and shows an overlap from the API', async () => {
    const fetchMock = fakeApi({
      ...routes(),
      'POST /api/schedules': { status: 409, body: { statusCode: 409, message: 'Schedule 4 of department 3 already covers part of this period' } }
    });
    renderApp('/schedules/new');
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'Ward 3B' });
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a department.');
    await user.selectOptions(screen.getByLabelText('Department'), 'Ward 3B');
    await user.clear(screen.getByLabelText('First day'));
    await user.type(screen.getByLabelText('First day'), '2026-11-02');
    await user.clear(screen.getByLabelText('Last day'));
    await user.type(screen.getByLabelText('Last day'), '2026-12-14');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A schedule covers at most 42 days.');
    expect(writes(fetchMock)).toEqual([]);
    await user.clear(screen.getByLabelText('Last day'));
    await user.type(screen.getByLabelText('Last day'), '2026-11-08');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Schedule 4 of department 3 already covers part of this period');
  });

  it('is offered to planners and closed to managers', async () => {
    fakeApi({ ...signedInAs(MANAGER), 'GET /api/schedules': { status: 200, body: [] }, 'GET /api/departments': { status: 200, body: [] } });
    const { unmount } = renderApp('/schedules');
    await screen.findByText('No schedules match the filters.');
    expect(screen.queryByRole('link', { name: 'New schedule' })).not.toBeInTheDocument();
    unmount();
    fakeApi({ ...signedInAs(MANAGER), 'GET /api/departments': { status: 200, body: [] } });
    renderApp('/schedules/new');
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
  });
});
