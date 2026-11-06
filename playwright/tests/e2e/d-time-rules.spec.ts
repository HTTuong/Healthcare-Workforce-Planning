import { expect, test } from '../../fixtures/test';
import { addDays } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Group D (2) in the browser: what a manager sees when the team cannot cover the week.

test.describe('D: scheduling core, time rules (UI)', { tag: '@groupD' }, () => {
  test('T21 T23 a manager sees the short shifts, the violations and two nurses at their 40 hours', { tag: ['@T21', '@T23'] }, async ({ factories, signInAs }) => {
    const department = await factories.departments.create();
    for (let i = 0; i < 7; i++) await factories.shifts.create({ department, date: addDays(WEEK.monday, i), headcount: 2 });
    const nurses = [await factories.employees.createEligibleEmployee({ department }), await factories.employees.createEligibleEmployee({ department })];
    const { schedule, violations } = await factories.schedules.createInReview({ department, start: WEEK.monday });
    // 14 places, 10 fillable: the engine decides how the 4 open places spread over the shifts, so the page is compared
    // with what the API reports, and the open places are counted from the violations.
    const open = violations.reduce((sum, v) => sum + 2 - Number(/has (\d) of 2/.exec(v.message)![1]), 0);
    expect(open).toBe(4);

    const page = await signInAs('MANAGER', `/schedules/${schedule.id}`);
    const n = violations.length;
    await expect(page.getByText(`${n} hard rule violations. The schedule cannot be approved until they are fixed (BR-W03).`)).toBeVisible();
    await expect(page.getByRole('region', { name: "Check with today's data" }).getByRole('listitem')).toHaveText(violations.map((v) => `BR-H06 ${v.message}`));
    await expect(page.locator('dt', { hasText: 'Shifts fully staffed' }).locator('xpath=following-sibling::dd[1]')).toHaveText(`${7 - n} of 7`);
    await expect(page.getByText(/^\s*short\s*$/)).toHaveCount(n);
    for (const nurse of nurses) {
      const row = page.getByRole('row', { name: new RegExp(`^${nurse.firstName} ${nurse.lastName}`) });
      await expect(row.getByRole('cell').nth(1)).toHaveText('5');
      await expect(row.getByRole('cell').nth(2)).toHaveText('40 h');
    }
  });
});
