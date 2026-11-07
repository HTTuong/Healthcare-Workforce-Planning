import { expect, test } from '../../fixtures/test';
import { addDays } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Group F in the browser: what a nurse sees before and after the manager publishes.

test.describe('F: approval workflow (UI)', { tag: '@groupF' }, () => {
  test('T30 T32 a nurse cannot open the approved schedule, then sees only her own shifts once it is published', { tag: ['@T30', '@T32'] }, async ({ api, factories, signInAs, signInAsEmployee }) => {
    const department = await factories.departments.create();
    for (let i = 0; i < 2; i++) await factories.shifts.create({ department, date: addDays(WEEK.monday, i) });
    const nurse = await factories.employees.createEligibleEmployee({ department });
    const { schedule } = await factories.schedules.createApproved({ department, start: WEEK.monday });
    const me = await signInAsEmployee(nurse);

    const page = await signInAs(me, `/schedules/${schedule.id}`);
    await expect(page.getByRole('alert')).toHaveText('This schedule does not exist or is not published yet.');

    await api.MANAGER.schedules.step(schedule.id, 'publish');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'My shifts' })).toBeVisible();
    await expect(page.getByText('2 shifts, 16 h in total')).toBeVisible();
    await expect(page.getByRole('list', { name: 'My shifts' }).getByRole('listitem')).toHaveText([/Mon 3 Mar 2031, 07:00 to 15:00/, /Tue 4 Mar 2031, 07:00 to 15:00/]);
    // A nurse is never offered a workflow button.
    await expect(page.getByRole('group', { name: 'Workflow' })).toHaveCount(0);
  });
});
