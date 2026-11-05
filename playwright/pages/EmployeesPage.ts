import type { Locator, Page } from '@playwright/test';

/** The employee list. */
export class EmployeesPage {
  readonly heading: Locator;
  readonly search: Locator;
  readonly role: Locator;
  readonly newEmployee: Locator;
  readonly count: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1, name: 'Employees' });
    this.search = page.getByLabel('Search');
    this.role = page.getByLabel('Role');
    this.newEmployee = page.getByRole('link', { name: 'New employee' });
    this.count = page.locator('.count');
  }

  async goto() {
    await this.page.goto('/employees');
    await this.count.waitFor();
  }

  /** The table row of one employee, found by name or email. */
  row(text: string): Locator {
    return this.page.getByRole('row', { name: new RegExp(text) });
  }
}
