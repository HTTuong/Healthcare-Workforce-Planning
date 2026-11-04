import { screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeApi, NOORA, sent, signedInAs } from '../test/fake-api';
import { renderApp } from '../test/render-app';

const LEAVE = { id: 11, employeeId: 26, type: 'LEAVE', startsAt: '2030-07-07T21:00:00.000Z', endsAt: '2030-07-12T21:00:00.000Z' };
const OLD = { id: 10, employeeId: 26, type: 'UNAVAILABLE', startsAt: '2020-03-02T06:00:00.000Z', endsAt: '2020-03-02T14:00:00.000Z' };
const routes = (records: object[] = [LEAVE, OLD]) => ({
  ...signedInAs(NOORA),
  'GET /api/departments/3': { status: 200, body: { name: 'Ward 3B' } },
  'GET /api/availabilities?employeeId=26': { status: 200, body: records }
});

const calls = (fetchMock: ReturnType<typeof fakeApi>) =>
  fetchMock.mock.calls.map((call) => `${(call[1] as RequestInit).method ?? 'GET'} ${String(call[0])}`);

async function fill(user: UserEvent, label: string, value: string) {
  const input = screen.getByLabelText(label, { exact: true });
  await user.clear(input);
  await user.type(input, value);
}

describe('availability page', () => {
  it('lists upcoming entries in Helsinki time and hides past ones until asked', async () => {
    fakeApi(routes());
    renderApp('/availability');
    const list = await screen.findByRole('list', { name: 'Availability entries' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Mon 8 Jul 2030 to Fri 12 Jul 2030, whole days')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByLabelText('Show past entries'));
    expect(within(list).getByText('Mon 2 Mar 2020 08:00 to 16:00')).toBeInTheDocument();
  });

  it('adds a timed entry for the signed in employee with Helsinki offsets', async () => {
    const fetchMock = fakeApi({ ...routes([]), 'POST /api/availabilities': { status: 201, body: {} } });
    renderApp('/availability');
    const user = userEvent.setup();
    await screen.findByText('No entries yet.');
    await user.click(screen.getByLabelText('Unavailable'));
    await fill(user, 'From', '2026-10-24');
    await fill(user, 'From time', '18:00');
    await fill(user, 'To', '2026-10-25');
    await fill(user, 'To time', '08:00');
    await user.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(await screen.findByText('Unavailable: Sat 24 Oct 2026 18:00 to Sun 25 Oct 2026 08:00 was saved.')).toBeInTheDocument();
    expect(sent(fetchMock, calls(fetchMock).indexOf('POST /api/availabilities')).body).toEqual({
      type: 'UNAVAILABLE',
      startsAt: '2026-10-24T18:00:00+03:00',
      endsAt: '2026-10-25T08:00:00+02:00',
      employeeId: 26
    });
    // The list is read again after saving.
    expect(calls(fetchMock).filter((call) => call === 'GET /api/availabilities?employeeId=26')).toHaveLength(2);
  });

  it('adds whole days of leave from the first day to the midnight after the last', async () => {
    const fetchMock = fakeApi({ ...routes([]), 'POST /api/availabilities': { status: 201, body: {} } });
    renderApp('/availability');
    const user = userEvent.setup();
    await screen.findByText('No entries yet.');
    await user.click(screen.getByLabelText('Leave'));
    await user.click(screen.getByLabelText('Whole days'));
    expect(screen.queryByLabelText('From time')).not.toBeInTheDocument();
    await fill(user, 'From', '2026-12-21');
    await fill(user, 'To (last day)', '2026-12-24');
    await user.click(screen.getByRole('button', { name: 'Add entry' }));
    await screen.findByText('Leave: Mon 21 Dec 2026 to Thu 24 Dec 2026, whole days was saved.');
    expect(sent(fetchMock, calls(fetchMock).indexOf('POST /api/availabilities')).body).toMatchObject({
      type: 'LEAVE',
      startsAt: '2026-12-21T00:00:00+02:00',
      endsAt: '2026-12-25T00:00:00+02:00'
    });
  });

  it('names the entry in the way instead of sending an overlap', async () => {
    const fetchMock = fakeApi(routes());
    renderApp('/availability');
    const user = userEvent.setup();
    await screen.findByRole('list', { name: 'Availability entries' });
    await fill(user, 'From', '2030-07-12');
    await fill(user, 'To', '2030-07-12');
    await user.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This overlaps your leave entry for Mon 8 Jul 2030 to Fri 12 Jul 2030, whole days. Change or delete that entry first.'
    );
    expect(calls(fetchMock).some((call) => call.startsWith('POST'))).toBe(false);
  });

  it('shows the API conflict when another tab saved an overlap first', async () => {
    fakeApi({
      ...routes([]),
      'POST /api/availabilities': { status: 409, body: { statusCode: 409, message: 'Overlaps availability 99 (2026-11-02T06:00:00.000Z to 2026-11-02T14:00:00.000Z)' } }
    });
    renderApp('/availability');
    await screen.findByText('No entries yet.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add entry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Overlaps availability 99');
  });

  it('refuses an end before the start', async () => {
    fakeApi(routes([]));
    renderApp('/availability');
    const user = userEvent.setup();
    await screen.findByText('No entries yet.');
    await fill(user, 'To time', '07:00');
    await user.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The end must be after the start.');
  });

  it('changes an entry, and its own time does not count as an overlap', async () => {
    const fetchMock = fakeApi({ ...routes(), 'PATCH /api/availabilities/11': { status: 200, body: {} } });
    renderApp('/availability');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Change Leave Mon 8 Jul 2030 to Fri 12 Jul 2030, whole days' }));
    expect(screen.getByRole('heading', { name: 'Change entry' })).toBeInTheDocument();
    expect(screen.getByLabelText('Whole days')).toBeChecked();
    expect(screen.getByLabelText('To (last day)')).toHaveValue('2030-07-12');
    await fill(user, 'To (last day)', '2030-07-14');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Leave: Mon 8 Jul 2030 to Sun 14 Jul 2030, whole days was saved.');
    expect(sent(fetchMock, calls(fetchMock).indexOf('PATCH /api/availabilities/11')).body).toEqual({
      type: 'LEAVE',
      startsAt: '2030-07-08T00:00:00+03:00',
      endsAt: '2030-07-15T00:00:00+03:00'
    });
    expect(screen.getByRole('heading', { name: 'Add an entry' })).toBeInTheDocument();
  });

  it('deletes only after a second click', async () => {
    const fetchMock = fakeApi({ ...routes(), 'DELETE /api/availabilities/11': { status: 204 } });
    renderApp('/availability');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Delete Leave/ }));
    expect(calls(fetchMock)).not.toContain('DELETE /api/availabilities/11');
    await user.click(screen.getByRole('button', { name: /^Yes, delete Leave/ }));
    expect(await screen.findByText('Leave: Mon 8 Jul 2030 to Fri 12 Jul 2030, whole days was deleted.')).toBeInTheDocument();
    expect(calls(fetchMock)).toContain('DELETE /api/availabilities/11');
  });

  it('names each type and explains it as the description', async () => {
    fakeApi(routes([]));
    renderApp('/availability');
    expect(await screen.findByLabelText('Leave')).toHaveAccessibleDescription('Holiday or other leave. You will not be scheduled.');
    expect(screen.getByLabelText('Available')).toBeChecked();
  });

  it('is in the navigation for every role', async () => {
    fakeApi(routes([]));
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Availability' })).toHaveAttribute('href', '/availability');
  });
});
