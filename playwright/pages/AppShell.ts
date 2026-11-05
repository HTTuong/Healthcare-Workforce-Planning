import type { Locator, Page } from '@playwright/test';

/** The frame around every signed in page: navigation, the account and Sign out. */
export class AppShell {
  readonly nav: Locator;
  readonly roleBadge: Locator;
  readonly signOutButton: Locator;
  readonly heading: Locator;

  constructor(readonly page: Page) {
    this.nav = page.getByRole('navigation', { name: 'Main' });
    this.roleBadge = page.locator('.role-badge');
    this.signOutButton = page.getByRole('button', { name: 'Sign out' });
    this.heading = page.getByRole('heading', { level: 1 });
  }

  /** The link texts of the main navigation, in order. */
  async navLinks(): Promise<string[]> {
    await this.nav.waitFor();
    return this.nav.getByRole('link').allTextContents();
  }

  async open(link: string) {
    await this.nav.getByRole('link', { name: link }).click();
  }

  async signOut() {
    await this.signOutButton.click();
  }
}
