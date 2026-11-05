import { expect, test } from '../../fixtures/test';
import { TEST_USERS } from '../../factories/users';
import { EmployeesPage } from '../../pages/EmployeesPage';

test.describe('employee list', { tag: '@smoke' }, () => {
  test('an admin finds an employee by email', async ({ signInAs }) => {
    const employees = new EmployeesPage(await signInAs('ADMIN', '/employees'));
    await employees.count.waitFor();
    await employees.search.fill(TEST_USERS.PLANNER.email);
    await expect(employees.count).toHaveText(/^1 of \d+ employees$/);
    await expect(employees.row('Pia Planner')).toContainText('Planner');
    await expect(employees.newEmployee).toBeVisible();
  });
});
