import { expect, test } from '../../fixtures/test';
import { addDays } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Group E in the browser: the scores a manager reads are the ones the API computed.

test.describe('E: optimization (UI)', { tag: '@groupE' }, () => {
  test('T28 the page shows the four scores, the quality and the saved score as the API reports them', { tag: '@T28' }, async ({ api, factories, signInAs }) => {
    const department = await factories.departments.create();
    for (let i = 0; i < 3; i++) await factories.shifts.create({ department, date: addDays(WEEK.monday, i), type: 'NIGHT' });
    // A 16 h contract that the three 9.5 h nights cannot all fit in, so the scores are not all 100.
    await factories.employees.createEligibleEmployee({ department, contractMinutesPerWeek: 960 });
    const { schedule } = await factories.schedules.createInReview({ department, start: WEEK.monday });
    const { scores } = await api.MANAGER.schedules.check(schedule.id);
    expect(scores.overtime).toBeLessThan(100);

    const page = await signInAs('MANAGER', `/schedules/${schedule.id}`);
    const panel = page.getByRole('region', { name: "Check with today's data" });
    for (const [label, value] of [['Preference', scores.preference], ['Fairness', scores.fairness], ['Workload', scores.workload], ['Overtime', scores.overtime], ['Quality', scores.quality]] as const) {
      await expect(panel.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')).toHaveText(String(Math.round(value)));
    }
    await expect(page.locator('dt', { hasText: 'Saved quality score' }).locator('xpath=following-sibling::dd[1]')).toHaveText(`${schedule.qualityScore} / 100`);
  });
});
