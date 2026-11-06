import type { Locator, Page } from '@playwright/test';

/** The create and edit employee form, with the set password form below it when editing. */
export class EmployeeFormPage {
  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly email: Locator;
  readonly role: Locator;
  readonly department: Locator;
  readonly hours: Locator;
  readonly minutes: Locator;
  readonly active: Locator;
  readonly add: Locator;
  readonly save: Locator;
  readonly alert: Locator;

  constructor(readonly page: Page) {
    this.firstName = page.getByLabel('First name');
    this.lastName = page.getByLabel('Last name');
    this.email = page.getByLabel('Email');
    this.role = page.getByLabel('Role');
    this.department = page.getByLabel('Department');
    this.hours = page.getByLabel('hours', { exact: true });
    this.minutes = page.getByLabel('minutes', { exact: true });
    this.active = page.getByLabel(/^Active/);
    this.add = page.getByRole('button', { name: 'Add employee' });
    this.save = page.getByRole('button', { name: 'Save changes' });
    this.alert = page.getByRole('alert');
  }

  /** The error under a field, for example "Enter a first name.". */
  fieldError(text: string): Locator {
    return this.page.locator('.field-error', { hasText: text });
  }
}
