import type { Locator, Page } from '@playwright/test';

/** "New shift" and "Edit shift": the form, its requirement rows and the two step delete. */
export class ShiftFormPage {
  readonly department: Locator;
  readonly type: Locator;
  readonly date: Locator;
  readonly start: Locator;
  readonly end: Locator;
  readonly summary: Locator;
  readonly headcount: Locator;
  readonly addQualification: Locator;
  readonly add: Locator;
  readonly save: Locator;
  readonly delete: Locator;
  readonly confirmDelete: Locator;
  readonly alert: Locator;

  constructor(readonly page: Page) {
    this.department = page.getByLabel('Department');
    this.type = page.getByLabel('Type');
    this.date = page.getByLabel('Date');
    this.start = page.getByLabel('Start');
    this.end = page.getByLabel('End');
    this.summary = page.getByText(/^Ends .* Length .*\.$/);
    this.headcount = page.getByLabel('People needed');
    this.addQualification = page.getByRole('button', { name: 'Add qualification' });
    this.add = page.getByRole('button', { name: 'Add shift' });
    this.save = page.getByRole('button', { name: 'Save changes' });
    this.delete = page.getByRole('button', { name: 'Delete shift' });
    this.confirmDelete = page.getByRole('button', { name: 'Yes, delete' });
    this.alert = page.getByRole('alert');
  }

  /** The qualification select and its count of requirement row n, counted from 1. */
  requirement(n: number): { qualification: Locator; count: Locator } {
    return {
      qualification: this.page.getByLabel(`Qualification ${n}`, { exact: true }),
      count: this.page.getByLabel(`People with qualification ${n}`)
    };
  }
}
