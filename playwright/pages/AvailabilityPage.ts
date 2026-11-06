import type { Locator, Page } from '@playwright/test';

export type AvailabilityKind = 'Available' | 'Unavailable' | 'Leave';

/** "My availability": the form to add or change an entry, and the list of entries with Change and Delete. */
export class AvailabilityPage {
  readonly heading: Locator;
  readonly wholeDays: Locator;
  readonly from: Locator;
  readonly fromTime: Locator;
  readonly to: Locator;
  readonly toTime: Locator;
  readonly lastDay: Locator;
  readonly add: Locator;
  readonly save: Locator;
  readonly alert: Locator;
  readonly notice: Locator;
  readonly entries: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'My availability' });
    this.wholeDays = page.getByLabel('Whole days');
    this.from = page.getByLabel('From', { exact: true });
    this.fromTime = page.getByLabel('From time');
    this.to = page.getByLabel('To', { exact: true });
    this.toTime = page.getByLabel('To time');
    this.lastDay = page.getByLabel('To (last day)');
    this.add = page.getByRole('button', { name: 'Add entry' });
    this.save = page.getByRole('button', { name: 'Save changes' });
    this.alert = page.getByRole('alert');
    this.notice = page.getByRole('status');
    this.entries = page.getByRole('list', { name: 'Availability entries' });
  }

  type(kind: AvailabilityKind): Locator {
    return this.page.getByLabel(kind, { exact: true });
  }

  /** The list item whose text is this entry, e.g. "Mon 3 Mar 2031 08:00 to 16:00". */
  entry(text: string): Locator {
    return this.entries.getByRole('listitem').filter({ hasText: text });
  }

  /** Fills a range within one or more days. Dates are YYYY-MM-DD, times HH:MM, both Helsinki time. */
  async fillTimes(kind: AvailabilityKind, from: [string, string], to: [string, string]) {
    await this.type(kind).check();
    await this.from.fill(from[0]);
    await this.fromTime.fill(from[1]);
    await this.to.fill(to[0]);
    await this.toTime.fill(to[1]);
  }

  /** Fills whole days, from the first to the last day included. */
  async fillWholeDays(kind: AvailabilityKind, first: string, last: string) {
    await this.type(kind).check();
    await this.wholeDays.check();
    await this.from.fill(first);
    await this.lastDay.fill(last);
  }
}
