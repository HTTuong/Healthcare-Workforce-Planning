import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi, signedInAs } from '../test/fake-api';
import { renderApp } from '../test/render-app';
import type { Role } from './types';

// What each role sees in the UI (day 27/11). One row per role, so a change to a permission shows up here as a
// changed row, next to the API table that permissions.contract.test.ts compares the UI with.

const ROLES: Role[] = ['ADMIN', 'PLANNER', 'MANAGER', 'EMPLOYEE'];
const profile = (role: Role) => ({ sub: 50, role, firstName: 'Test', lastName: role, email: `${role}@example.com`, departmentId: null });

/** Every list the pages read, empty, so any page can render for any role. */
function emptyApi(role: Role) {
  return fakeApi({
    ...signedInAs(profile(role)),
    'GET /api/employees': { status: 200, body: [] },
    'GET /api/departments': { status: 200, body: [] },
    'GET /api/qualifications': { status: 200, body: [] },
    'GET /api/shifts': { status: 200, body: [] },
    'GET /api/schedules': { status: 200, body: [] },
    'GET /api/availabilities?employeeId=50': { status: 200, body: [] }
  });
}

const NAV: Record<Role, string[]> = {
  ADMIN: ['Home', 'Schedules', 'Availability', 'Employees', 'Shifts'],
  PLANNER: ['Home', 'Schedules', 'Availability', 'Employees', 'Shifts'],
  MANAGER: ['Home', 'Schedules', 'Availability', 'Employees', 'Shifts'],
  EMPLOYEE: ['Home', 'Schedules', 'Availability']
};

// Page address, the heading it shows when allowed, and the roles that may open it.
const PAGES: Array<[string, string, Role[]]> = [
  ['/availability', 'My availability', ROLES],
  ['/schedules', 'Schedules|Published schedules', ROLES],
  ['/schedules/new', 'New schedule', ['ADMIN', 'PLANNER']],
  ['/employees', 'Employees', ['ADMIN', 'PLANNER', 'MANAGER']],
  ['/employees/new', 'New employee', ['ADMIN']],
  ['/shifts', 'Shifts', ['ADMIN', 'PLANNER', 'MANAGER']],
  ['/shifts/new', 'New shift', ['ADMIN', 'PLANNER']]
];

// Page, the link that creates something there, and the roles that see it.
const CREATE_LINKS: Array<[string, string, Role[]]> = [
  ['/employees', 'New employee', ['ADMIN']],
  ['/shifts', 'New shift', ['ADMIN', 'PLANNER']],
  ['/schedules', 'New schedule', ['ADMIN', 'PLANNER']]
];

describe('UI by role', () => {
  for (const role of ROLES) {
    it(`${role} sees the navigation ${NAV[role].join(', ')}`, async () => {
      emptyApi(role);
      renderApp('/');
      const nav = await screen.findByRole('navigation', { name: 'Main' });
      expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(NAV[role]);
    });

    for (const [path, heading, allowed] of PAGES) {
      const open = allowed.includes(role);
      it(`${role} ${open ? 'opens' : 'gets No access on'} ${path}`, async () => {
        const fetchMock = emptyApi(role);
        renderApp(path);
        const shown = await screen.findByRole('heading', { level: 1, name: new RegExp(`^(${heading}|No access)$`) });
        expect(shown.textContent === 'No access').toBe(!open);
        if (!open) {
          // A closed page asks the API for nothing beyond the signed in user.
          expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(['/api/auth/me']);
        }
      });
    }

    for (const [path, link, allowed] of CREATE_LINKS) {
      if (!PAGES.find(([p]) => p === path)![2].includes(role)) continue;
      const shown = allowed.includes(role);
      it(`${role} ${shown ? 'sees' : 'does not see'} ${link} on ${path}`, async () => {
        emptyApi(role);
        renderApp(path);
        await screen.findByRole('heading', { level: 1 });
        await screen.findByText(/No .* match|No published schedule|No employees match|No shifts in this week/);
        expect(screen.queryByRole('link', { name: link }) !== null).toBe(shown);
      });
    }
  }
});

describe('role changed while signed in', () => {
  it('reads the profile again after a 403 and shows what the new role can do', async () => {
    let me = 0;
    const fetchMock = fakeApi({
      ...signedInAs(profile('ADMIN')),
      // First the admin profile, then, after an admin demoted this user, the employee profile.
      'GET /api/auth/me': () => ({ status: 200, body: profile(++me === 1 ? 'ADMIN' : 'EMPLOYEE') }),
      'GET /api/employees': { status: 403, body: { statusCode: 403, message: 'Forbidden resource' } },
      'GET /api/departments': { status: 200, body: [] }
    });
    renderApp('/employees');
    expect(await screen.findByText('Your role is now Employee. The pages show what this role can do.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'No access' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(NAV.EMPLOYEE);
    expect(fetchMock.mock.calls.filter((call) => String(call[0]) === '/api/auth/me')).toHaveLength(2);
  });

  it('keeps the page when a 403 does not come from a role change', async () => {
    fakeApi({
      ...signedInAs(profile('ADMIN')),
      'GET /api/employees': { status: 403, body: { statusCode: 403, message: 'Forbidden resource' } },
      'GET /api/departments': { status: 200, body: [] }
    });
    renderApp('/employees');
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden resource');
    expect(screen.queryByText(/Your role is now/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
  });
});
