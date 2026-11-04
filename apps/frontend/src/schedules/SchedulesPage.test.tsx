import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeApi, MANAGER, NOORA, signedInAs } from '../test/fake-api';
import { renderApp } from '../test/render-app';

const DEPARTMENTS = [
  { id: 3, code: 'W3B', name: 'Ward 3B' },
  { id: 4, code: 'ICU', name: 'Intensive care' }
];
const summary = (id: number, departmentId: number, status: string, qualityScore: number | null) => ({
  id,
  departmentId,
  periodStart: '2026-11-02',
  periodEnd: '2026-11-08',
  status,
  qualityScore
});
const ALL = [summary(1, 3, 'PUBLISHED', 84), summary(2, 3, 'REVIEW', 71), summary(3, 4, 'DRAFT', null)];

describe('schedules list', () => {
  it('shows staff every schedule with status and quality, and filters them', async () => {
    fakeApi({ ...signedInAs(MANAGER), 'GET /api/schedules': { status: 200, body: ALL }, 'GET /api/departments': { status: 200, body: DEPARTMENTS } });
    renderApp('/schedules');
    const user = userEvent.setup();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    const review = within(table).getByText('In review').closest('tr')!;
    expect(review).toHaveTextContent('Ward 3B');
    expect(review).toHaveTextContent('71 / 100');
    expect(within(table).getByText('Draft').closest('tr')).toHaveTextContent('-');
    expect(within(table).getAllByRole('link', { name: 'Mon 2 Nov 2026 to Sun 8 Nov 2026' })[0]).toHaveAttribute('href', '/schedules/1');
    await user.selectOptions(screen.getByLabelText('Department'), 'Ward 3B');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    await user.selectOptions(screen.getByLabelText('Status'), 'PUBLISHED');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
  });

  it('shows an employee the published schedules the API returns, without quality or filters', async () => {
    fakeApi({
      ...signedInAs(NOORA),
      'GET /api/departments/3': { status: 200, body: DEPARTMENTS[0] },
      'GET /api/schedules': { status: 200, body: [ALL[0]] },
      'GET /api/departments': { status: 200, body: DEPARTMENTS }
    });
    renderApp('/schedules');
    expect(await screen.findByRole('heading', { name: 'Published schedules' })).toBeInTheDocument();
    await screen.findByRole('table');
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('says so when an employee has no published schedule', async () => {
    fakeApi({
      ...signedInAs(NOORA),
      'GET /api/departments/3': { status: 200, body: DEPARTMENTS[0] },
      'GET /api/schedules': { status: 200, body: [] },
      'GET /api/departments': { status: 200, body: DEPARTMENTS }
    });
    renderApp('/schedules');
    expect(await screen.findByText('No published schedule for you yet.')).toBeInTheDocument();
  });
});
