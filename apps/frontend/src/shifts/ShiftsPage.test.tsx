import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ADMIN, MANAGER, NOORA, fakeApi, signedInAs } from '../test/fake-api';
import { renderApp } from '../test/render-app';

const PLANNER = { ...ADMIN, sub: 2, role: 'PLANNER', firstName: 'Pia', lastName: 'Planner' };
const shift = (id: number, type: string, startsAt: string, endsAt: string, departmentId = 3, requirements: object[] = []) => ({
  id,
  departmentId,
  type,
  startsAt,
  endsAt,
  requiredHeadcount: 2,
  requirements
});
// Week of Monday 19 October 2026, which ends with the change to winter time on Sunday 25 October.
const SHIFTS = [
  shift(1, 'MORNING', '2026-10-19T04:00:00.000Z', '2026-10-19T12:00:00.000Z', 3, [{ qualificationId: 5, count: 1 }]),
  shift(2, 'NIGHT', '2026-10-24T19:00:00.000Z', '2026-10-25T04:00:00.000Z'),
  // Sunday 25 October 23:30 local (21:30Z) is the last shift of this week.
  shift(3, 'NIGHT', '2026-10-25T21:30:00.000Z', '2026-10-26T05:00:00.000Z', 4),
  // Monday 26 October 00:30 local is 22:30Z on Sunday, but belongs to the next week.
  shift(4, 'NIGHT', '2026-10-25T22:30:00.000Z', '2026-10-26T06:00:00.000Z'),
  shift(5, 'EVENING', '2026-10-12T12:00:00.000Z', '2026-10-12T20:00:00.000Z'),
  // Exactly Monday 26 October 00:00 local: the first instant of the next week.
  shift(6, 'MORNING', '2026-10-25T22:00:00.000Z', '2026-10-26T06:00:00.000Z')
];
const lists = {
  'GET /api/shifts': { status: 200, body: SHIFTS },
  'GET /api/shifts?departmentId=3': { status: 200, body: SHIFTS.filter((s) => s.departmentId === 3) },
  'GET /api/departments': { status: 200, body: [{ id: 3, code: 'W3B', name: 'Ward 3B' }, { id: 4, code: 'ICU', name: 'Intensive care' }] },
  'GET /api/qualifications': { status: 200, body: [{ id: 5, code: 'MED', name: 'Medication permit' }] }
};

const row = (name: RegExp) => screen.getByRole('row', { name });
/** Waits until the table or the empty message is there. */
const loaded = () => screen.findByText(/^Date$|^No shifts in this week\.$/);

describe('shifts page', () => {
  it('shows the week in Helsinki time, with the 9 hour night of the clock change', async () => {
    fakeApi({ ...signedInAs(PLANNER), ...lists });
    renderApp('/shifts?week=2026-10-19');
    await loaded();
    expect(screen.getByRole('heading', { name: 'Mon 19 Oct 2026 to Sun 25 Oct 2026' })).toBeInTheDocument();
    const morning = within(row(/Mon 19 Oct 2026 Morning/));
    expect(morning.getByText('07:00 to 15:00')).toBeInTheDocument();
    expect(morning.getByText('MED × 1')).toBeInTheDocument();
    expect(morning.getByText('Ward 3B')).toBeInTheDocument();
    const night = within(row(/Sat 24 Oct 2026 Night/));
    expect(night.getByText(/22:00 to 06:00/)).toHaveTextContent('22:00 to 06:00 next day');
    expect(night.getByText('9 h')).toBeInTheDocument();
  });

  it('puts a shift in the week of its local start date, not its UTC date', async () => {
    fakeApi({ ...signedInAs(PLANNER), ...lists });
    renderApp('/shifts?week=2026-10-19');
    await loaded();
    expect(row(/Sun 25 Oct 2026 Night/)).toHaveTextContent('23:30 to 07:00');
    expect(screen.getAllByRole('row')).toHaveLength(1 + 3);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByRole('heading', { name: 'Mon 26 Oct 2026 to Sun 1 Nov 2026' })).toBeInTheDocument();
    expect(row(/Mon 26 Oct 2026 Night/)).toHaveTextContent('00:30 to 08:00');
    expect(row(/Mon 26 Oct 2026 Morning/)).toHaveTextContent('00:00 to 08:00');
  });

  it('moves between weeks and keeps the week in the address', async () => {
    fakeApi({ ...signedInAs(PLANNER), ...lists });
    renderApp('/shifts?week=2026-10-21');
    const user = userEvent.setup();
    // Any day of a week opens that week's Monday.
    await loaded();
    expect(screen.getByRole('heading', { name: /^Mon 19 Oct 2026/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByRole('heading', { name: /^Mon 12 Oct 2026/ })).toBeInTheDocument();
    expect(row(/Mon 12 Oct 2026 Evening/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByText('No shifts in this week.')).toBeInTheDocument();
  });

  it('asks the API for one department when one is chosen', async () => {
    const fetchMock = fakeApi({ ...signedInAs(PLANNER), ...lists });
    renderApp('/shifts?week=2026-10-19');
    await loaded();
    await userEvent.setup().selectOptions(screen.getByLabelText('Department'), 'Ward 3B');
    await screen.findByRole('row', { name: /Mon 19 Oct 2026 Morning/ });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain('/api/shifts?departmentId=3');
    expect(screen.queryByText('Intensive care', { selector: 'td' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New shift' })).toHaveAttribute('href', '/shifts/new?department=3');
  });

  it('gives a planner edit links and a manager none', async () => {
    fakeApi({ ...signedInAs(PLANNER), ...lists });
    const { unmount } = renderApp('/shifts?week=2026-10-19');
    expect(await screen.findByRole('link', { name: 'Edit Morning shift on Mon 19 Oct 2026' })).toHaveAttribute('href', '/shifts/1/edit');
    unmount();
    fakeApi({ ...signedInAs(MANAGER), ...lists });
    renderApp('/shifts?week=2026-10-19');
    await screen.findByRole('row', { name: /Mon 19 Oct 2026 Morning/ });
    expect(screen.queryByRole('link', { name: /^Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New shift' })).not.toBeInTheDocument();
  });

  it('keeps an employee out', async () => {
    fakeApi({ ...signedInAs(NOORA), 'GET /api/departments/3': { status: 200, body: { name: 'Ward 3B' } } });
    renderApp('/shifts');
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Shifts' })).not.toBeInTheDocument();
  });
});
