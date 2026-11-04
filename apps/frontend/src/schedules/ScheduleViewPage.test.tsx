import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi, MANAGER, NOORA, signedInAs } from '../test/fake-api';
import { renderApp } from '../test/render-app';

const DEPARTMENTS = [{ id: 3, code: 'W3B', name: 'Ward 3B' }];
const shift = (id: number, type: string, startsAt: string, endsAt: string, requiredHeadcount: number) => ({
  id,
  departmentId: 3,
  type,
  startsAt,
  endsAt,
  requiredHeadcount,
  requirements: []
});
// Week of 19 October 2026: a morning for 2 people and the 9 hour night of the clock change for 1.
const MORNING = shift(1, 'MORNING', '2026-10-19T04:00:00.000Z', '2026-10-19T12:00:00.000Z', 2);
const NIGHT = shift(2, 'NIGHT', '2026-10-24T19:00:00.000Z', '2026-10-25T04:00:00.000Z', 1);
const OTHER_WEEK = shift(3, 'MORNING', '2026-10-27T05:00:00.000Z', '2026-10-27T13:00:00.000Z', 1);
const person = (id: number, firstName: string, lastName: string) => ({ id, firstName, lastName });
const assignment = (id: number, s: typeof MORNING, employee: ReturnType<typeof person>) => ({
  id,
  scheduleId: 5,
  shiftId: s.id,
  employeeId: employee.id,
  shift: { id: s.id, type: s.type, startsAt: s.startsAt, endsAt: s.endsAt },
  employee
});
const noora = person(26, 'Noora', 'Nurse');
const aaro = person(27, 'Aaro', 'Aalto');
const SCHEDULE = {
  id: 5,
  departmentId: 3,
  periodStart: '2026-10-19',
  periodEnd: '2026-10-25',
  status: 'REVIEW',
  qualityScore: 78,
  actions: ['approve', 'reject'],
  assignments: [assignment(1, MORNING, noora), assignment(2, NIGHT, aaro)]
};
const CHECK = {
  violations: [{ ruleId: 'BR-H06', shiftId: 1, message: 'Shift 1 has 1 of 2 people' }],
  scores: { preference: 100, fairness: 50, workload: 87.6, overtime: 100, quality: 84.5 }
};

describe('schedule view for staff', () => {
  function open(check = CHECK) {
    fakeApi({
      ...signedInAs(MANAGER),
      'GET /api/schedules/5': { status: 200, body: SCHEDULE },
      'GET /api/departments': { status: 200, body: DEPARTMENTS },
      'GET /api/shifts?departmentId=3': { status: 200, body: [NIGHT, MORNING, OTHER_WEEK] },
      'GET /api/schedules/5/check': { status: 200, body: check }
    });
    renderApp('/schedules/5');
  }

  it('shows the period, the status and every shift of the period by day', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Ward 3B, Mon 19 Oct 2026 to Sun 25 Oct 2026' })).toBeInTheDocument();
    expect(screen.getByText('In review')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mon 19 Oct 2026' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sat 24 Oct 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tue 27 Oct 2026' })).not.toBeInTheDocument();
    const night = screen.getByRole('row', { name: /22:00 to 06:00 next day/ });
    expect(night).toHaveTextContent('Aaro Aalto');
    expect(night).toHaveTextContent('1 of 1');
    expect(night).not.toHaveTextContent('short');
    expect(night).not.toHaveClass('problem');
  });

  it('marks a short shift and its violation, and counts fully staffed shifts', async () => {
    open();
    const morning = await screen.findByRole('row', { name: /07:00 to 15:00/ });
    expect(morning).toHaveTextContent('1 of 2 short');
    expect(morning).toHaveTextContent('BR-H06');
    expect(morning).toHaveClass('problem');
    expect(screen.getByText('Shifts fully staffed').nextElementSibling).toHaveTextContent('1 of 2');
  });

  it('lists the violations and rounds the scores', async () => {
    open();
    expect(await screen.findByText(/1 hard rule violation\. The schedule cannot be approved/)).toBeInTheDocument();
    expect(screen.getByText('Shift 1 has 1 of 2 people')).toBeInTheDocument();
    const scores = screen.getByText('Quality', { selector: 'dt' }).closest('dl')!;
    expect(within(scores).getByText('Workload').nextElementSibling).toHaveTextContent('88');
    expect(within(scores).getByText('Quality').nextElementSibling).toHaveTextContent('85');
  });

  it('says when nothing is broken', async () => {
    open({ ...CHECK, violations: [] });
    expect(await screen.findByText('No hard rule is broken. The schedule can be approved.')).toBeInTheDocument();
  });

  it('shows the work per employee, with the 9 hour night as 9 hours', async () => {
    open();
    const heading = await screen.findByRole('heading', { name: 'Work per employee' });
    const table = within(heading.nextElementSibling as HTMLElement);
    // Columns: employee, shifts, hours, nights. Most hours first.
    const rows = table.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['Aaro Aalto', '1', '9 h', '1'],
      ['Noora Nurse', '1', '8 h', '0']
    ]);
  });
});

describe('schedule view for an employee', () => {
  it('shows only its own shifts, without asking for shifts or the check', async () => {
    const fetchMock = fakeApi({
      ...signedInAs(NOORA),
      'GET /api/departments/3': { status: 200, body: DEPARTMENTS[0] },
      'GET /api/schedules/5': { status: 200, body: { ...SCHEDULE, status: 'PUBLISHED', actions: [], assignments: [assignment(1, MORNING, noora)] } },
      'GET /api/departments': { status: 200, body: DEPARTMENTS }
    });
    renderApp('/schedules/5');
    const list = await screen.findByRole('list', { name: 'My shifts' });
    expect(within(list).getByText('Mon 19 Oct 2026, 07:00 to 15:00')).toBeInTheDocument();
    expect(screen.getByText('1 shift, 8 h in total')).toBeInTheDocument();
    const paths = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(paths).not.toContain('/api/shifts?departmentId=3');
    expect(paths).not.toContain('/api/schedules/5/check');
  });

  it('explains a schedule it cannot see', async () => {
    fakeApi({
      ...signedInAs(NOORA),
      'GET /api/departments/3': { status: 200, body: DEPARTMENTS[0] },
      'GET /api/schedules/6': { status: 404, body: { message: 'Schedule 6 not found' } }
    });
    renderApp('/schedules/6');
    expect(await screen.findByRole('alert')).toHaveTextContent('This schedule does not exist or is not published yet.');
  });
});
