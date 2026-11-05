import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ADMIN, fakeApi, signedInAs } from '../test/fake-api';
import { renderApp } from '../test/render-app';

// Findings of the manual UI session on day 28/11 (docs/exploratory-testing.md, session 2).

const lists = () => ({
  ...signedInAs(ADMIN),
  'GET /api/employees': { status: 200, body: [] },
  'GET /api/departments': { status: 200, body: [] },
  'GET /api/qualifications': { status: 200, body: [] },
  'GET /api/shifts': { status: 200, body: [] },
  'GET /api/schedules': { status: 200, body: [] },
  'GET /api/availabilities?employeeId=1': { status: 200, body: [] }
});

describe('U-01: every page has its own title', () => {
  const pages: Array<[string, string]> = [
    ['/', 'Home'],
    ['/employees', 'Employees'],
    ['/employees/new', 'New employee'],
    ['/shifts', 'Shifts'],
    ['/shifts/new', 'New shift'],
    ['/availability', 'My availability'],
    ['/schedules', 'Schedules'],
    ['/schedules/new', 'New schedule']
  ];
  for (const [path, title] of pages) {
    it(`${path} is "${title}"`, async () => {
      fakeApi(lists());
      renderApp(path);
      await waitFor(() => expect(document.title).toBe(`${title} | Healthcare Workforce Planning`));
    });
  }

  it('the login page and a closed page have titles too', async () => {
    fakeApi({});
    const { unmount } = renderApp('/login');
    await waitFor(() => expect(document.title).toBe('Sign in | Healthcare Workforce Planning'));
    unmount();
    fakeApi({ ...signedInAs({ ...ADMIN, role: 'EMPLOYEE' }) });
    renderApp('/employees');
    await waitFor(() => expect(document.title).toBe('No access | Healthcare Workforce Planning'));
  });

  it('a schedule is titled by its department and period', async () => {
    fakeApi({
      ...lists(),
      'GET /api/departments': { status: 200, body: [{ id: 3, code: 'W3B', name: 'Ward 3B' }] },
      'GET /api/schedules/5': {
        status: 200,
        body: { id: 5, departmentId: 3, periodStart: '2026-11-02', periodEnd: '2026-11-08', status: 'DRAFT', qualityScore: null, actions: [], assignments: [] }
      },
      'GET /api/shifts?departmentId=3': { status: 200, body: [] },
      'GET /api/schedules/5/check': { status: 200, body: { violations: [], scores: { preference: 100, fairness: 100, workload: 100, overtime: 100, quality: 100 } } }
    });
    renderApp('/schedules/5');
    await waitFor(() => expect(document.title).toBe('Ward 3B, Mon 2 Nov 2026 to Sun 8 Nov 2026 | Healthcare Workforce Planning'));
  });
});

describe('U-02: an address that names no record says so without asking the API', () => {
  const cases: Array<[string, string]> = [
    ['/schedules/abc', 'This schedule does not exist or is not published yet.'],
    ['/schedules/99999999999', 'This schedule does not exist or is not published yet.'],
    ['/employees/abc/edit', 'This employee does not exist.'],
    ['/shifts/0/edit', 'This shift does not exist.']
  ];
  for (const [path, message] of cases) {
    it(path, async () => {
      const fetchMock = fakeApi(lists());
      renderApp(path);
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      const asked = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(asked.filter((p) => /\/(schedules|employees|shifts)\/[^/]*$/.test(p))).toEqual([]);
    });
  }
});

describe('U-03: a link opened while signed out keeps its query after login', () => {
  it('returns to /shifts with the week', async () => {
    fakeApi({
      ...lists(),
      'POST /api/auth/login': { status: 200, body: { accessToken: 'new-token' } },
      'GET /api/auth/me': { status: 200, body: ADMIN }
    });
    sessionStorage.clear();
    renderApp('/shifts?week=2026-10-19');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Mon 19 Oct 2026 to Sun 25 Oct 2026' })).toBeInTheDocument();
  });
});
