import type { Locator, Page } from '@playwright/test';

/** The login form. Locators use roles and labels, as a user and a screen reader find them. */
export class LoginPage {
  readonly heading: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly alert: Locator;
  readonly notice: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Sign in' });
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.submit = page.getByRole('button', { name: 'Sign in' });
    this.alert = page.getByRole('alert');
    this.notice = page.getByRole('status');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async signIn(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }

  /** The error shown under a field, for example "Enter your email address.". */
  fieldError(text: string): Locator {
    return this.page.locator('.field-error', { hasText: text });
  }
}
