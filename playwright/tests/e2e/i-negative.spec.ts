import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { ShiftFormPage } from '../../pages/ShiftFormPage';
import { WEEK } from '../../utils/test-week';

// Group I in the browser: the forms refuse input that cannot be right, say why, and send nothing to the API.

/** Collects the writes the page sends, so a test can show that a refused form sent none. */
function writes(page: Page): string[] {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET') sent.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return sent;
}

test.describe('I: negative testing (UI)', { tag: '@groupI' }, () => {
  test('T38 a shift at a time that does not exist (03:30 on the spring change) is refused before sending', { tag: '@T38' }, async ({ api, factories, signInAs }) => {
    const department = await factories.departments.create();
    const page = await signInAs('PLANNER', `/shifts/new?department=${department.id}`);
    const sent = writes(page);
    const form = new ShiftFormPage(page);
    await form.type.selectOption('NIGHT');
    await form.date.fill('2031-03-29');
    // Saturday 22:00 to Sunday 03:30: the clocks jump from 03:00 to 04:00, so 03:30 never happens.
    await form.end.fill('03:30');
    await form.add.click();
    // A field error, tied to the time fields (aria-invalid and aria-describedby), not a form alert.
    await expect(page.getByText('That time does not exist on this day, because the clocks move forward an hour.')).toBeVisible();
    await expect(form.end).toHaveAttribute('aria-invalid', 'true');
    await expect(form.summary).toHaveCount(0);
    expect(sent).toEqual([]);
    expect(await api.PLANNER.shifts.list(department.id)).toEqual([]);
  });

  test('T38 a planning period that ends before it starts, or is longer than 42 days, is refused before sending', { tag: '@T38' }, async ({ factories, signInAs }) => {
    const department = await factories.departments.create();
    const page = await signInAs('PLANNER', '/schedules/new');
    const sent = writes(page);
    const submit = async (first: string, last: string) => {
      await page.getByLabel('Department').selectOption(String(department.id));
      await page.getByLabel('First day').fill(first);
      await page.getByLabel('Last day').fill(last);
      await page.getByRole('button', { name: 'Create draft' }).click();
    };
    await submit(WEEK.sunday, WEEK.monday);
    await expect(page.getByRole('alert')).toHaveText('The last day cannot be before the first day.');
    await submit('2031-04-01', '2031-05-13');
    await expect(page.getByRole('alert')).toHaveText('A schedule covers at most 42 days.');
    expect(sent).toEqual([]);
  });
});
