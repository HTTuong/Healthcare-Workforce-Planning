import { screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ADMIN, MANAGER, fakeApi, sent, signedInAs } from '../test/fake-api';
import { renderApp } from '../test/render-app';

const PLANNER = { ...ADMIN, sub: 2, role: 'PLANNER', firstName: 'Pia', lastName: 'Planner' };
const base = {
  'GET /api/departments': { status: 200, body: [{ id: 3, code: 'W3B', name: 'Ward 3B' }] },
  'GET /api/qualifications': {
    status: 200,
    body: [
      { id: 5, code: 'MED', name: 'Medication permit' },
      { id: 6, code: 'RN', name: 'Registered nurse' },
      { id: 7, code: 'BLS', name: 'Basic life support' }
    ]
  },
  'GET /api/shifts?departmentId=3': { status: 200, body: [] }
};
const NIGHT = {
  id: 9,
  departmentId: 3,
  type: 'NIGHT',
  startsAt: '2026-10-24T19:00:00.000Z',
  endsAt: '2026-10-25T04:00:00.000Z',
  requiredHeadcount: 3,
  requirements: [
    { qualificationId: 5, count: 2 },
    { qualificationId: 6, count: 1 }
  ]
};

/** Every request the fake received, as 'METHOD path'. */
const calls = (fetchMock: ReturnType<typeof fakeApi>) =>
  fetchMock.mock.calls.map((call) => `${(call[1] as RequestInit).method ?? 'GET'} ${String(call[0])}`);

async function fill(user: UserEvent, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  if (value) await user.type(input, value);
}

describe('new shift form', () => {
  it('creates the night of the clock change with Helsinki offsets and a requirement', async () => {
    const fetchMock = fakeApi({ ...signedInAs(PLANNER), ...base, 'POST /api/shifts': { status: 201, body: NIGHT } });
    renderApp('/shifts/new?department=3');
    const user = userEvent.setup();
    expect(await screen.findByLabelText('Department')).toHaveValue('3');
    await user.selectOptions(screen.getByLabelText('Type'), 'NIGHT');
    expect(screen.getByLabelText('Start')).toHaveValue('22:00');
    await fill(user, 'Date', '2026-10-24');
    await fill(user, 'End', '06:00');
    expect(screen.getByText('Ends Sun 25 Oct 2026 at 06:00. Length 9 h.')).toBeInTheDocument();
    await fill(user, 'People needed', '3');
    await user.click(screen.getByRole('button', { name: 'Add qualification' }));
    await user.selectOptions(screen.getByLabelText('Qualification 1'), 'MED Medication permit');
    await fill(user, 'People with qualification 1', '2');
    await user.click(screen.getByRole('button', { name: 'Add shift' }));
    expect(await screen.findByText('Night shift on Sat 24 Oct 2026 was added.')).toBeInTheDocument();
    expect(sent(fetchMock, calls(fetchMock).indexOf('POST /api/shifts')).body).toEqual({
      type: 'NIGHT',
      startsAt: '2026-10-24T22:00:00+03:00',
      endsAt: '2026-10-25T06:00:00+02:00',
      requiredHeadcount: 3,
      departmentId: 3,
      requirements: [{ qualificationId: 5, count: 2 }]
    });
    // Back on the list, in the week of the new shift and its department.
    expect(calls(fetchMock)).toContain('GET /api/shifts?departmentId=3');
    expect(screen.getByRole('heading', { name: /^Mon 19 Oct 2026/ })).toBeInTheDocument();
  });

  it('checks the department, the times, the headcount and the requirements before sending', async () => {
    const fetchMock = fakeApi({ ...signedInAs(PLANNER), ...base });
    renderApp('/shifts/new');
    const user = userEvent.setup();
    await screen.findByLabelText('Department');
    await fill(user, 'Date', '2027-03-28');
    await fill(user, 'Start', '03:30');
    await fill(user, 'People needed', '1');
    await user.click(screen.getByRole('button', { name: 'Add qualification' }));
    await user.selectOptions(screen.getByLabelText('Qualification 1'), 'MED Medication permit');
    await fill(user, 'People with qualification 1', '2');
    await user.click(screen.getByRole('button', { name: 'Add shift' }));
    expect(screen.getByText('Choose a department.')).toBeInTheDocument();
    expect(screen.getByText('That time does not exist on this day, because the clocks move forward an hour.')).toBeInTheDocument();
    expect(screen.getByText('A requirement cannot need more than the 1 people of the shift.')).toBeInTheDocument();
    expect(calls(fetchMock).some((call) => call.startsWith('POST'))).toBe(false);
  });

  it('shows an API refusal and stays on the form', async () => {
    fakeApi({
      ...signedInAs(PLANNER),
      ...base,
      'POST /api/shifts': { status: 404, body: { statusCode: 404, message: 'Department or qualification not found' } }
    });
    renderApp('/shifts/new?department=3');
    await screen.findByLabelText('Department');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add shift' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Department or qualification not found');
    expect(screen.getByRole('heading', { name: 'New shift' })).toBeInTheDocument();
  });

  it('is closed to a manager', async () => {
    fakeApi({ ...signedInAs(MANAGER), ...base });
    renderApp('/shifts/new');
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
  });
});

describe('edit shift form', () => {
  // A function, because signedInAs stores the token and every test starts with empty storage.
  const editRoutes = () => ({
    ...signedInAs(PLANNER),
    ...base,
    'GET /api/shifts/9': { status: 200, body: NIGHT },
    'PATCH /api/shifts/9': { status: 200, body: NIGHT },
    'DELETE /api/shifts/9/requirements/6': { status: 204 },
    'PUT /api/shifts/9/requirements/5': { status: 200, body: {} },
    'PUT /api/shifts/9/requirements/7': { status: 200, body: {} },
    'DELETE /api/shifts/9': { status: 204 }
  });

  it('loads the shift in local time with the department locked', async () => {
    fakeApi(editRoutes());
    renderApp('/shifts/9/edit');
    expect(await screen.findByLabelText('Date')).toHaveValue('2026-10-24');
    expect(screen.getByLabelText('Start')).toHaveValue('22:00');
    expect(screen.getByLabelText('End')).toHaveValue('06:00');
    expect(screen.getByLabelText('Department')).toBeDisabled();
    expect(screen.getByLabelText('Department')).toHaveAccessibleDescription('The department of a shift cannot change.');
    expect(screen.getByLabelText('People with qualification 1')).toHaveValue('2');
  });

  it('saves in the order the API accepts: remove, lower, the shift, then raise and add', async () => {
    const fetchMock = fakeApi(editRoutes());
    renderApp('/shifts/9/edit');
    const user = userEvent.setup();
    await screen.findByLabelText('Date');
    // Lower the headcount to 1, so MED must go from 2 to 1 before the shift changes; drop RN; add BLS.
    await fill(user, 'People needed', '1');
    await fill(user, 'People with qualification 1', '1');
    await user.click(screen.getByRole('button', { name: 'Remove qualification 2' }));
    await user.click(screen.getByRole('button', { name: 'Add qualification' }));
    await user.selectOptions(screen.getByLabelText('Qualification 2'), 'BLS Basic life support');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Night shift on Sat 24 Oct 2026 was saved.')).toBeInTheDocument();
    const writes = calls(fetchMock).filter((call) => !call.startsWith('GET'));
    expect(writes).toEqual([
      'DELETE /api/shifts/9/requirements/6',
      'PUT /api/shifts/9/requirements/5',
      'PATCH /api/shifts/9',
      'PUT /api/shifts/9/requirements/7'
    ]);
    expect(sent(fetchMock, calls(fetchMock).indexOf('PATCH /api/shifts/9')).body).toEqual({
      type: 'NIGHT',
      startsAt: '2026-10-24T22:00:00+03:00',
      endsAt: '2026-10-25T06:00:00+02:00',
      requiredHeadcount: 1
    });
    expect(sent(fetchMock, calls(fetchMock).indexOf('PUT /api/shifts/9/requirements/5')).body).toEqual({ count: 1 });
  });

  it('keeps the times when the type changes on an existing shift', async () => {
    fakeApi(editRoutes());
    renderApp('/shifts/9/edit');
    await screen.findByLabelText('Date');
    await userEvent.setup().selectOptions(screen.getByLabelText('Type'), 'MORNING');
    expect(screen.getByLabelText('Start')).toHaveValue('22:00');
  });

  it('tells the user to reload when a step of the save fails', async () => {
    fakeApi({ ...editRoutes(), 'PATCH /api/shifts/9': { status: 400, body: { statusCode: 400, message: 'endsAt must be later than startsAt' } } });
    renderApp('/shifts/9/edit');
    await screen.findByLabelText('Date');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('endsAt must be later than startsAt Reload the page to see what was saved.');
  });

  it('deletes only after a second click', async () => {
    const fetchMock = fakeApi(editRoutes());
    renderApp('/shifts/9/edit');
    const user = userEvent.setup();
    await screen.findByLabelText('Date');
    await user.click(screen.getByRole('button', { name: 'Delete shift' }));
    expect(calls(fetchMock)).not.toContain('DELETE /api/shifts/9');
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    await user.click(screen.getByRole('button', { name: 'Delete shift' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('Night shift on Sat 24 Oct 2026 was deleted.')).toBeInTheDocument();
    expect(calls(fetchMock)).toContain('DELETE /api/shifts/9');
  });

  it('says so when the shift does not exist', async () => {
    fakeApi({ ...signedInAs(PLANNER), ...base, 'GET /api/shifts/404': { status: 404, body: { message: 'Shift 404 not found' } } });
    renderApp('/shifts/404/edit');
    expect(await screen.findByRole('alert')).toHaveTextContent('This shift does not exist.');
  });
});
