import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ADMIN, MANAGER, NOORA, fakeApi, signedInAs } from '../test/fake-api';
import { renderApp } from '../test/render-app';

const EMPLOYEES = [
  { id: 1, firstName: 'Aino', lastName: 'Admin', email: 'admin@example.com', role: 'ADMIN', departmentId: null, contractMinutesPerWeek: 2295, active: true },
  { id: 7, firstName: 'Noora', lastName: 'Nurse', email: 'noora@example.com', role: 'EMPLOYEE', departmentId: 3, contractMinutesPerWeek: 2400, active: true },
  { id: 8, firstName: 'Niko', lastName: 'Night', email: 'niko@example.com', role: 'EMPLOYEE', departmentId: 99, contractMinutesPerWeek: 1200, active: false }
];
const DEPARTMENTS = [{ id: 3, code: 'W3B', name: 'Ward 3B' }];
const lists = {
  'GET /api/employees': { status: 200, body: EMPLOYEES },
  'GET /api/departments': { status: 200, body: DEPARTMENTS }
};

function rowOf(name: string) {
  return screen.getByRole('row', { name: new RegExp(name) });
}

describe('employees page', () => {
  it('lists every employee with department name, contract hours and status', async () => {
    fakeApi({ ...signedInAs(ADMIN), ...lists });
    renderApp('/employees');
    expect(await screen.findByText('3 of 3 employees')).toBeInTheDocument();
    const noora = within(rowOf('Noora Nurse'));
    expect(noora.getByText('Ward 3B')).toBeInTheDocument();
    expect(noora.getByText('40 h')).toBeInTheDocument();
    expect(noora.getByText('Active')).toBeInTheDocument();
    expect(within(rowOf('Aino Admin')).getByText('38 h 15 min')).toBeInTheDocument();
    expect(within(rowOf('Aino Admin')).getByText('-')).toBeInTheDocument();
    // A department the list does not know is shown by id instead of disappearing.
    expect(within(rowOf('Niko Night')).getByText('#99')).toBeInTheDocument();
    expect(within(rowOf('Niko Night')).getByText('Inactive')).toBeInTheDocument();
  });

  it('filters by name or email, by role and by status', async () => {
    fakeApi({ ...signedInAs(ADMIN), ...lists });
    renderApp('/employees');
    const user = userEvent.setup();
    await screen.findByText('3 of 3 employees');
    await user.type(screen.getByLabelText('Search'), 'NIKO@');
    expect(screen.getByText('1 of 3 employees')).toBeInTheDocument();
    expect(rowOf('Niko Night')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search'));
    await user.selectOptions(screen.getByLabelText('Role'), 'EMPLOYEE');
    expect(screen.getByText('2 of 3 employees')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Show inactive'));
    expect(screen.getByText('1 of 3 employees')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search'), 'nobody');
    expect(screen.getByText('No employees match the filters.')).toBeInTheDocument();
  });

  it('gives an admin the create and edit links', async () => {
    fakeApi({ ...signedInAs(ADMIN), ...lists });
    renderApp('/employees');
    await screen.findByText('3 of 3 employees');
    expect(screen.getByRole('link', { name: 'New employee' })).toHaveAttribute('href', '/employees/new');
    expect(screen.getByRole('link', { name: 'Edit Noora Nurse' })).toHaveAttribute('href', '/employees/7/edit');
  });

  it('shows a manager the list without create or edit links', async () => {
    fakeApi({ ...signedInAs(MANAGER), ...lists });
    renderApp('/employees');
    await screen.findByText('3 of 3 employees');
    expect(screen.queryByRole('link', { name: 'New employee' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Edit/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Employees' })).toBeInTheDocument();
  });

  it('keeps an employee out of the page and out of the navigation, without calling the list', async () => {
    const fetchMock = fakeApi({ ...signedInAs(NOORA), 'GET /api/departments/3': { status: 200, body: DEPARTMENTS[0] } });
    renderApp('/employees');
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Employees' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain('/api/employees');
  });

  it('shows a load error with a retry that works', async () => {
    let calls = 0;
    fakeApi({
      ...signedInAs(ADMIN),
      ...lists,
      'GET /api/employees': () => (++calls === 1 ? { status: 500, body: { message: 'Internal server error' } } : { status: 200, body: EMPLOYEES })
    });
    renderApp('/employees');
    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('3 of 3 employees')).toBeInTheDocument();
  });
});
