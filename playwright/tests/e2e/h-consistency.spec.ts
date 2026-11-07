import { expect, test } from '../../fixtures/test';
import { AvailabilityPage } from '../../pages/AvailabilityPage';
import { EmployeeFormPage } from '../../pages/EmployeeFormPage';
import { ShiftFormPage } from '../../pages/ShiftFormPage';
import { helsinki } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Group H, API and UI consistency: what one side writes, the other shows exactly, in Helsinki time and in the same
// words. Data made through the API is read in the UI, data made in the UI is read back from the API. The week of the
// autumn clock change (Sunday 26 October 2031) and the spring one (Sunday 30 March 2031) test the time conversions.

test.describe('H: API and UI consistency', { tag: '@groupH' }, () => {
  test('H1 shifts made through the API are listed and opened in the UI with the same local times, length and requirements', { tag: '@H1' }, async ({ api, factories, signInAs }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    // Monday 20 October to Sunday 26 October 2031. The night of Saturday 25th runs into the clock change: 9 real hours.
    await api.PLANNER.shifts.create({ departmentId: department.id, type: 'MORNING', startsAt: helsinki('2031-10-20', '07:00'), endsAt: helsinki('2031-10-20', '15:00'), requiredHeadcount: 1 });
    const night = await api.PLANNER.shifts.create({
      departmentId: department.id,
      type: 'NIGHT',
      startsAt: helsinki('2031-10-25', '22:00'),
      endsAt: helsinki('2031-10-26', '06:00'),
      requiredHeadcount: 2,
      requirements: [{ qualificationId: permit.id, count: 1 }]
    });

    const page = await signInAs('PLANNER', `/shifts?week=2031-10-20&department=${department.id}`);
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows).toHaveCount(3);
    const cells = (n: number) => rows.nth(n).getByRole('cell');
    await expect(cells(1).first()).toHaveText('Mon 20 Oct 2031');
    await expect(cells(1)).toHaveText(['Mon 20 Oct 2031', 'Morning', '07:00 to 15:00', '8 h', department.name, '1', /^(-|–|None|)$/, /Edit/]);
    await expect(cells(2)).toHaveText(['Sat 25 Oct 2031', 'Night', '22:00 to 06:00 next day', '9 h', department.name, '2', `${permit.code} × 1`, /Edit/]);

    await page.getByRole('link', { name: 'Edit Night shift on Sat 25 Oct 2031' }).click();
    const form = new ShiftFormPage(page);
    await expect(form.date).toHaveValue('2031-10-25');
    await expect(form.start).toHaveValue('22:00');
    await expect(form.end).toHaveValue('06:00');
    await expect(form.summary).toHaveText('Ends Sun 26 Oct 2031 at 06:00. Length 9 h.');
    await expect(form.headcount).toHaveValue('2');
    await expect(form.requirement(1).qualification).toHaveValue(String(permit.id));
    expect(page.url()).toContain(`/shifts/${night.id}/edit`);
  });

  test('H2 a schedule made in the UI is the one the API holds, and the API\'s refusal reaches the form word for word', { tag: '@H2' }, async ({ api, factories, signInAs }) => {
    const department = await factories.departments.create();
    const page = await signInAs('PLANNER', '/schedules/new');
    const fill = async (first: string, last: string) => {
      await page.getByLabel('Department').selectOption(String(department.id));
      await page.getByLabel('First day').fill(first);
      await page.getByLabel('Last day').fill(last);
    };
    await fill(WEEK.monday, WEEK.sunday);
    await expect(page.getByText('7 days. Only shifts that start and end inside the period are planned.')).toBeVisible();
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page).toHaveURL(/\/schedules\/\d+$/);
    const id = Number(/\/schedules\/(\d+)$/.exec(page.url())![1]);
    expect(await api.PLANNER.schedules.get(id)).toMatchObject({ departmentId: department.id, periodStart: WEEK.monday, periodEnd: WEEK.sunday, status: 'DRAFT' });

    // A second schedule over part of the same week: the form shows the API's own message.
    await page.goto('/schedules/new');
    await fill(WEEK.sunday, WEEK.nextMonday);
    const refused = await api.PLANNER.post('/schedules', { departmentId: department.id, periodStart: WEEK.sunday, periodEnd: WEEK.nextMonday });
    expect(refused.status()).toBe(409);
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page.getByRole('alert')).toHaveText((await refused.json()).message);
  });

  test('H3 a schedule generated through the API shows each shift with the people the API assigned', { tag: '@H3' }, async ({ api, factories, signInAs }) => {
    const department = await factories.departments.create();
    const shifts = [
      await factories.shifts.create({ department, date: WEEK.monday, headcount: 2 }),
      await factories.shifts.create({ department, date: WEEK.wednesday, type: 'NIGHT' })
    ];
    const team = [await factories.employees.createEligibleEmployee({ department }), await factories.employees.createEligibleEmployee({ department })];
    const { schedule } = await factories.schedules.createInReview({ department, start: WEEK.monday });
    const names = (shiftId: number) =>
      schedule.assignments!.filter((a) => a.shiftId === shiftId).map((a) => team.find((e) => e.id === a.employeeId)!).map((e) => `${e.firstName} ${e.lastName}`);

    const page = await signInAs('MANAGER', `/schedules/${schedule.id}`);
    const day = (label: string) => page.getByRole('region', { name: label });
    const peopleOf = (label: string) => day(label).getByRole('row').nth(1).getByRole('cell').nth(3);
    await expect(day('Mon 3 Mar 2031').getByRole('row').nth(1).getByRole('cell')).toHaveText(['07:00 to 15:00', 'Morning', '2 of 2', names(shifts[0]!.id).join(', ')]);
    await expect(peopleOf('Wed 5 Mar 2031')).toHaveText(names(shifts[1]!.id).join(', '));
    await expect(day('Tue 4 Mar 2031')).toHaveCount(0);
    // The API's own check says the same as the page: no violation.
    expect((await api.MANAGER.schedules.check(schedule.id)).violations).toEqual([]);
    await expect(page.getByText('No hard rule is broken. The schedule can be approved.')).toBeVisible();
  });

  test('H4 an employee made through the API opens in the form as stored, and a change in the form is what the API returns', { tag: '@H4' }, async ({ api, factories, signInAs }) => {
    const department = await factories.departments.create();
    const employee = await factories.employees.create({ department, role: 'MANAGER', contractMinutesPerWeek: 1845 });
    await api.ADMIN.employees.update(employee.id, { active: false });

    const page = await signInAs('ADMIN', `/employees/${employee.id}/edit`);
    const form = new EmployeeFormPage(page);
    await expect(form.firstName).toHaveValue(employee.firstName);
    await expect(form.email).toHaveValue(employee.email);
    await expect(form.role).toHaveValue('MANAGER');
    await expect(form.department).toHaveValue(String(department.id));
    await expect(form.hours).toHaveValue('30');
    await expect(form.minutes).toHaveValue('45');
    await expect(form.active).not.toBeChecked();

    await form.hours.fill('20');
    await form.minutes.fill('0');
    await form.role.selectOption('EMPLOYEE');
    await form.active.check();
    await form.save.click();
    await expect(page.getByRole('status').filter({ hasText: 'saved' })).toBeVisible();
    expect(await api.ADMIN.employees.get(employee.id)).toMatchObject({ contractMinutesPerWeek: 1200, role: 'EMPLOYEE', active: true, departmentId: department.id });
  });

  test('H5 availability across the spring clock change is shown in local time both ways (BR-T01, BR-T02)', { tag: '@H5' }, async ({ factories, signInAs, signInAsEmployee }) => {
    const employee = await factories.employees.create();
    const me = await signInAsEmployee(employee);
    // 02:00 to 05:00 on Sunday 30 March 2031 lasts 2 real hours: the clock jumps from 03:00 to 04:00.
    const made = await me.availability.create({ employeeId: employee.id, type: 'UNAVAILABLE', startsAt: '2031-03-30T02:00:00+02:00', endsAt: '2031-03-30T05:00:00+03:00' });
    expect((Date.parse(made.endsAt) - Date.parse(made.startsAt)) / 3_600_000).toBe(2);

    const page = new AvailabilityPage(await signInAs(me, '/availability'));
    await expect(page.entry('Sun 30 Mar 2031 02:00 to 05:00')).toBeVisible();
    // The other way: an entry typed in local time on the day after the change is stored at +03:00.
    await page.fillTimes('Available', ['2031-03-31', '08:00'], ['2031-03-31', '16:00']);
    await page.add.click();
    await expect(page.notice).toHaveText('Available: Mon 31 Mar 2031 08:00 to 16:00 was saved.');
    expect((await me.availability.list()).map((a) => [a.startsAt, a.endsAt])).toEqual([
      ['2031-03-30T00:00:00.000Z', '2031-03-30T02:00:00.000Z'],
      ['2031-03-31T05:00:00.000Z', '2031-03-31T13:00:00.000Z']
    ]);
  });
});
