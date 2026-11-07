import { expect, test } from '../../fixtures/test';
import { AvailabilityPage } from '../../pages/AvailabilityPage';
import { helsinki } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Group B in the browser. Each test signs in as an employee it created, so its entries never meet another test's.

test.describe('B: availability (UI)', { tag: '@groupB' }, () => {
  test('T10 an employee records leave as whole days, stored from 00:00 of the first day to 00:00 after the last', { tag: '@T10' }, async ({ factories, signInAsEmployee, signInAs }) => {
    const employee = await factories.employees.create();
    const me = await signInAsEmployee(employee);
    const page = new AvailabilityPage(await signInAs(me, '/availability'));
    await expect(page.page.getByText('No entries yet.')).toBeVisible();

    await page.fillWholeDays('Leave', WEEK.monday, WEEK.tuesday);
    await page.add.click();
    await expect(page.notice).toHaveText('Leave: Mon 3 Mar 2031 to Tue 4 Mar 2031, whole days was saved.');
    await expect(page.entry('Mon 3 Mar 2031 to Tue 4 Mar 2031, whole days')).toContainText('Leave');
    // Helsinki is at +02:00 in March, so local midnight is 22:00 UTC the day before.
    expect(await me.availability.list()).toEqual([
      expect.objectContaining({ type: 'LEAVE', startsAt: '2031-03-02T22:00:00.000Z', endsAt: '2031-03-04T22:00:00.000Z' })
    ]);
  });

  test('T07 an employee adds time it cannot work, changes it and deletes it', { tag: '@T07' }, async ({ factories, signInAsEmployee, signInAs }) => {
    const employee = await factories.employees.create();
    const me = await signInAsEmployee(employee);
    const page = new AvailabilityPage(await signInAs(me, '/availability'));

    // A range across midnight.
    await page.fillTimes('Unavailable', [WEEK.monday, '22:00'], [WEEK.tuesday, '06:00']);
    await page.add.click();
    await expect(page.notice).toHaveText('Unavailable: Mon 3 Mar 2031 22:00 to Tue 4 Mar 2031 06:00 was saved.');

    await page.page.getByRole('button', { name: 'Change Unavailable Mon 3 Mar 2031 22:00 to Tue 4 Mar 2031 06:00' }).click();
    await expect(page.page.getByRole('heading', { name: 'Change entry' })).toBeVisible();
    await page.toTime.fill('07:30');
    await page.save.click();
    await expect(page.notice).toHaveText('Unavailable: Mon 3 Mar 2031 22:00 to Tue 4 Mar 2031 07:30 was saved.');
    const [stored] = await me.availability.list();
    expect(stored).toMatchObject({ startsAt: '2031-03-03T20:00:00.000Z', endsAt: '2031-03-04T05:30:00.000Z' });

    await page.page.getByRole('button', { name: 'Delete Unavailable Mon 3 Mar 2031 22:00 to Tue 4 Mar 2031 07:30' }).click();
    await page.page.getByRole('button', { name: 'Yes, delete Unavailable Mon 3 Mar 2031 22:00 to Tue 4 Mar 2031 07:30' }).click();
    await expect(page.notice).toHaveText('Unavailable: Mon 3 Mar 2031 22:00 to Tue 4 Mar 2031 07:30 was deleted.');
    await expect(page.page.getByText('No entries yet.')).toBeVisible();
    expect(await me.availability.list()).toEqual([]);
  });

  test('T11 an overlap is named before sending, and one made elsewhere shows the API message', { tag: '@T11' }, async ({ factories, signInAsEmployee, signInAs }) => {
    const employee = await factories.employees.create();
    const me = await signInAsEmployee(employee);
    await me.availability.create({ employeeId: employee.id, type: 'UNAVAILABLE', startsAt: helsinki(WEEK.monday, '08:00'), endsAt: helsinki(WEEK.monday, '16:00') });
    const page = new AvailabilityPage(await signInAs(me, '/availability'));
    await expect(page.entry('Mon 3 Mar 2031 08:00 to 16:00')).toBeVisible();

    // The page knows the entry, so it names it and sends nothing.
    await page.fillTimes('Available', [WEEK.monday, '12:00'], [WEEK.monday, '20:00']);
    await page.add.click();
    await expect(page.alert).toHaveText('This overlaps your unavailable entry for Mon 3 Mar 2031 08:00 to 16:00. Change or delete that entry first.');

    // An entry added from another device after the page loaded: only the API knows it, and answers 409.
    // In development React runs the loading effect twice (StrictMode), so the test waits until the page has finished
    // loading; a second load landing after the new entry would let the page name it instead.
    await page.page.waitForLoadState('networkidle');
    await me.availability.create({ employeeId: employee.id, type: 'LEAVE', startsAt: helsinki(WEEK.tuesday, '00:00'), endsAt: helsinki(WEEK.wednesday, '00:00') });
    await page.fillTimes('Available', [WEEK.tuesday, '08:00'], [WEEK.tuesday, '16:00']);
    await page.add.click();
    await expect(page.alert).toContainText(/^Overlaps availability \d+/);
    expect(await me.availability.list()).toHaveLength(2);
  });
});
