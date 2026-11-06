import { expect, test } from '../../fixtures/test';
import { EmployeeFormPage } from '../../pages/EmployeeFormPage';
import { EmployeesPage } from '../../pages/EmployeesPage';
import { uniqueEmail } from '../../utils/unique';

test.describe('A: employee management (UI)', { tag: '@groupA' }, () => {
  test('T01 an admin adds an employee through the form and finds it in the list', { tag: '@T01' }, async ({ signInAs, factories, api }) => {
    const department = await factories.departments.create();
    const page = await signInAs('ADMIN', '/employees/new');
    const form = new EmployeeFormPage(page);
    const email = uniqueEmail('t01-ui');
    await form.firstName.fill('Helmi');
    await form.lastName.fill('Laine');
    await form.email.fill(email);
    await form.role.selectOption('PLANNER');
    await form.department.selectOption({ label: department.name });
    await form.hours.fill('30');
    await form.minutes.fill('45');
    await form.add.click();

    const list = new EmployeesPage(page);
    await expect(page.getByText('Helmi Laine was added. Set a password so they can sign in.')).toBeVisible();
    await list.search.fill(email);
    await expect(list.row(email)).toContainText('30 h 45 min');
    await expect(list.row(email)).toContainText(department.name);
    const stored = (await api.ADMIN.employees.list()).find((e) => e.email === email);
    expect(stored).toMatchObject({ role: 'PLANNER', departmentId: department.id, contractMinutesPerWeek: 1845, active: true });
  });

  test('T01 the form checks the fields before sending and shows a used email at the field', { tag: '@T01' }, async ({ signInAs, factories }) => {
    const existing = await factories.employees.create();
    const page = await signInAs('ADMIN', '/employees/new');
    const form = new EmployeeFormPage(page);
    await form.add.click();
    await expect(form.fieldError('Enter a first name.')).toBeVisible();
    await expect(form.fieldError('Enter an email address.')).toBeVisible();
    await form.firstName.fill('Eero');
    await form.lastName.fill('Koskinen');
    await form.email.fill(existing.email);
    await form.add.click();
    await expect(form.fieldError(`Email ${existing.email} is already used`)).toBeVisible();
  });

  test('T03 an admin deactivates an employee and the list shows it', { tag: '@T03' }, async ({ signInAs, factories, api }) => {
    const employee = await factories.employees.create();
    const page = await signInAs('ADMIN', `/employees/${employee.id}/edit`);
    const form = new EmployeeFormPage(page);
    await form.active.uncheck();
    await form.save.click();
    const list = new EmployeesPage(page);
    await list.search.fill(employee.email);
    await expect(list.row(employee.email)).toContainText('Inactive');
    expect((await api.ADMIN.employees.get(employee.id)).active).toBe(false);
  });

  test('T02 a planner can read the list but cannot open the form', { tag: '@T02' }, async ({ signInAs, factories }) => {
    const employee = await factories.employees.create();
    const page = await signInAs('PLANNER', '/employees');
    const list = new EmployeesPage(page);
    await list.search.fill(employee.email);
    await expect(list.row(employee.email)).toBeVisible();
    await expect(page.getByRole('link', { name: /^Edit/ })).toHaveCount(0);
    await page.goto(`/employees/${employee.id}/edit`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No access');
  });
});
