import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ADMIN, fakeApi, MANAGER, sent, signedInAs } from '../test/fake-api';
import { renderApp } from '../test/render-app';

const DEPARTMENTS = [
  { id: 3, code: 'W3B', name: 'Ward 3B' },
  { id: 4, code: 'ICU', name: 'Intensive care' }
];
const NOORA = { id: 7, firstName: 'Noora', lastName: 'Nurse', email: 'noora@example.com', role: 'EMPLOYEE', departmentId: 3, contractMinutesPerWeek: 2295, active: true };
const base = {
  'GET /api/departments': { status: 200, body: DEPARTMENTS },
  'GET /api/employees': { status: 200, body: [NOORA] }
};

/** The request the fake received for this method and path. */
function requestTo(fetchMock: ReturnType<typeof fakeApi>, key: string) {
  const index = fetchMock.mock.calls.findIndex((call) => `${(call[1] as RequestInit).method} ${String(call[0])}` === key);
  expect(index, key).toBeGreaterThanOrEqual(0);
  return sent(fetchMock, index);
}

describe('new employee form', () => {
  it('creates an employee and returns to the list with a notice', async () => {
    const fetchMock = fakeApi({
      ...signedInAs(ADMIN),
      ...base,
      'POST /api/employees': { status: 201, body: { ...NOORA, id: 9, firstName: 'Ella', lastName: 'Evening' } }
    });
    renderApp('/employees/new');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('First name'), ' Ella ');
    await user.type(screen.getByLabelText('Last name'), 'Evening');
    await user.type(screen.getByLabelText('Email'), 'ella@example.com');
    await user.selectOptions(screen.getByLabelText('Role'), 'PLANNER');
    await user.selectOptions(screen.getByLabelText('Department'), 'Intensive care');
    await user.clear(screen.getByLabelText('hours'));
    await user.type(screen.getByLabelText('hours'), '30');
    await user.clear(screen.getByLabelText('minutes'));
    await user.type(screen.getByLabelText('minutes'), '45');
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    expect(await screen.findByText('Ella Evening was added. Set a password so they can sign in.')).toBeInTheDocument();
    expect(requestTo(fetchMock, 'POST /api/employees').body).toEqual({
      firstName: 'Ella',
      lastName: 'Evening',
      email: 'ella@example.com',
      role: 'PLANNER',
      departmentId: 4,
      contractMinutesPerWeek: 1845
    });
  });

  it('starts with the full time default of 38 h 15 min, no department and no active box', async () => {
    fakeApi({ ...signedInAs(ADMIN), ...base });
    renderApp('/employees/new');
    expect(await screen.findByLabelText('hours')).toHaveValue('38');
    expect(screen.getByLabelText('minutes')).toHaveValue('15');
    expect(screen.getByLabelText('Department')).toHaveValue('');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Set password' })).not.toBeInTheDocument();
  });

  it('checks every field before sending', async () => {
    const fetchMock = fakeApi({ ...signedInAs(ADMIN), ...base });
    renderApp('/employees/new');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'ella@example');
    await user.clear(screen.getByLabelText('minutes'));
    await user.type(screen.getByLabelText('minutes'), '60');
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    expect(screen.getByText('Enter a first name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a last name.')).toBeInTheDocument();
    expect(screen.getByText('Enter an email address like name@example.com.')).toBeInTheDocument();
    expect(screen.getByText('Minutes must be between 0 and 59.')).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveAccessibleDescription('Enter a first name.');
    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit).method === 'POST')).toBe(false);
  });

  it('does not send while only a name is missing and the contract is valid', async () => {
    const fetchMock = fakeApi({ ...signedInAs(ADMIN), ...base });
    renderApp('/employees/new');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('First name'), 'Ella');
    await user.type(screen.getByLabelText('Email'), 'ella@example.com');
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    expect(screen.getByText('Enter a last name.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit).method === 'POST')).toBe(false);
  });

  it('shows a used email next to the email field', async () => {
    fakeApi({
      ...signedInAs(ADMIN),
      ...base,
      'POST /api/employees': { status: 409, body: { statusCode: 409, message: 'Email noora@example.com is already used' } }
    });
    renderApp('/employees/new');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('First name'), 'Noora');
    await user.type(screen.getByLabelText('Last name'), 'Again');
    await user.type(screen.getByLabelText('Email'), 'noora@example.com');
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    expect(await screen.findByText('Email noora@example.com is already used')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { name: 'New employee' })).toBeInTheDocument();
  });

  it('is closed to a manager', async () => {
    fakeApi({ ...signedInAs(MANAGER), ...base });
    renderApp('/employees/new');
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
  });
});

describe('edit employee form', () => {
  it('loads the employee, saves the changes and can deactivate', async () => {
    const fetchMock = fakeApi({
      ...signedInAs(ADMIN),
      ...base,
      'GET /api/employees/7': { status: 200, body: NOORA },
      'PATCH /api/employees/7': { status: 200, body: { ...NOORA, active: false } }
    });
    renderApp('/employees/7/edit');
    const user = userEvent.setup();
    expect(await screen.findByLabelText('First name')).toHaveValue('Noora');
    expect(screen.getByLabelText('Department')).toHaveValue('3');
    expect(screen.getByLabelText('hours')).toHaveValue('38');
    await user.click(screen.getByLabelText(/^Active/));
    await user.selectOptions(screen.getByLabelText('Department'), '');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Changes to Noora Nurse were saved.')).toBeInTheDocument();
    expect(requestTo(fetchMock, 'PATCH /api/employees/7').body).toEqual({
      firstName: 'Noora',
      lastName: 'Nurse',
      email: 'noora@example.com',
      role: 'EMPLOYEE',
      departmentId: null,
      contractMinutesPerWeek: 2295,
      active: false
    });
  });

  it('does not let an admin change their own role or deactivate themselves', async () => {
    const self = { ...NOORA, id: 1, role: 'ADMIN', firstName: 'Aino', lastName: 'Admin' };
    const fetchMock = fakeApi({
      ...signedInAs(ADMIN),
      ...base,
      'GET /api/employees/1': { status: 200, body: self },
      'PATCH /api/employees/1': { status: 200, body: self }
    });
    renderApp('/employees/1/edit');
    expect(await screen.findByLabelText('Role')).toBeDisabled();
    expect(screen.getByLabelText(/^Active/)).toBeDisabled();
    expect(screen.getByLabelText('Role')).toHaveAccessibleDescription('You cannot change your own role or deactivate your own account.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Changes to Aino Admin were saved.');
    const { body } = requestTo(fetchMock, 'PATCH /api/employees/1');
    expect(body).not.toHaveProperty('role');
    expect(body).not.toHaveProperty('active');
  });

  it('says so when the employee does not exist', async () => {
    fakeApi({ ...signedInAs(ADMIN), ...base, 'GET /api/employees/404': { status: 404, body: { message: 'Employee 404 not found' } } });
    renderApp('/employees/404/edit');
    expect(await screen.findByRole('alert')).toHaveTextContent('This employee does not exist.');
    expect(screen.getByRole('link', { name: 'Back to employees' })).toBeInTheDocument();
  });

  it('sets a password after checking length and repetition', async () => {
    const fetchMock = fakeApi({
      ...signedInAs(ADMIN),
      ...base,
      'GET /api/employees/7': { status: 200, body: NOORA },
      'PUT /api/auth/password/7': { status: 204 }
    });
    renderApp('/employees/7/edit');
    const user = userEvent.setup();
    const setPassword = async (password: string, repeat: string) => {
      await user.clear(screen.getByLabelText('New password'));
      await user.clear(screen.getByLabelText('Repeat the password'));
      if (password) await user.type(screen.getByLabelText('New password'), password);
      if (repeat) await user.type(screen.getByLabelText('Repeat the password'), repeat);
      await user.click(screen.getByRole('button', { name: 'Set password' }));
    };
    await screen.findByLabelText('New password');
    await setPassword('short-11chr', 'short-11chr');
    expect(screen.getByRole('alert')).toHaveTextContent('A password has 12 to 128 characters.');
    await setPassword('long-enough-1', 'long-enough-2');
    expect(screen.getByRole('alert')).toHaveTextContent('The two passwords are not the same.');
    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit).method === 'PUT')).toBe(false);
    await setPassword('exactly-12ch', 'exactly-12ch');
    expect(await screen.findByText('The password was set. Give it to the employee in a safe way.')).toBeInTheDocument();
    expect(requestTo(fetchMock, 'PUT /api/auth/password/7').body).toEqual({ password: 'exactly-12ch' });
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });
});
