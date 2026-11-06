import { expect, test } from '../../fixtures/test';
import { WEEK } from '../../utils/test-week';

// Group D (1) in the browser: the planner generates a schedule and sees what a hand edit breaks.

test.describe('D: scheduling core (UI)', { tag: '@groupD' }, () => {
  test('T17 T19 a planner generates a week, then adds an unqualified nurse by hand and sees the requirement short', { tag: ['@T17', '@T19'] }, async ({ api, factories, signInAs }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    const mondayShift = await factories.shifts.create({ department, date: WEEK.monday, headcount: 2, requires: [{ qualification: permit, count: 1 }] });
    await factories.shifts.create({ department, date: WEEK.tuesday });
    const holder = await factories.employees.createEligibleEmployee({ department, qualifications: [permit] });
    const other = await factories.employees.createEligibleEmployee({ department });
    const schedule = await factories.schedules.create({ department, start: WEEK.monday });

    const page = await signInAs('PLANNER', `/schedules/${schedule.id}`);
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Generated' })).toHaveText('Generated: 3 assignments added. No hard rule is broken.');
    await expect(page.getByText('No hard rule is broken. The schedule can be approved.')).toBeVisible();

    // Take the permit holder off Monday and put nobody with the permit in her place.
    const monday = 'Morning shift on Mon 3 Mar 2031';
    await page.getByRole('button', { name: `Remove ${holder.firstName} ${holder.lastName} from the ${monday}` }).click();
    await expect(page.getByLabel(`Add a person to the ${monday}`)).toBeVisible();
    const third = await factories.employees.createEligibleEmployee({ department });
    await page.reload();
    await page.getByLabel(`Add a person to the ${monday}`).selectOption({ label: `${third.firstName} ${third.lastName}` });

    const check = page.getByRole('region', { name: "Check with today's data" });
    await expect(check).toContainText('1 hard rule violation. The schedule cannot be approved until they are fixed (BR-W03).');
    await expect(check.getByRole('listitem')).toHaveText(new RegExp(`^BR-H06 Shift \\d+ has 0 of 1 people with qualification ${permit.id} valid for the shift$`));
    const stored = await api.PLANNER.schedules.get(schedule.id);
    expect(stored.status).toBe('DRAFT');
    const onMonday = stored.assignments!.filter((a) => a.shiftId === mondayShift.id).map((a) => a.employeeId);
    expect(onMonday.sort((x, y) => x - y)).toEqual([other.id, third.id].sort((x, y) => x - y));
  });
});
