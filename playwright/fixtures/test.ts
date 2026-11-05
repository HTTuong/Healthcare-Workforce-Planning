import { test as base, expect, type Page } from '@playwright/test';
import { ApiClient, type ApiByRole } from '../api/ApiClient';
import { ROLES, type Role } from '../api/types';
import { credentials } from '../factories/users';
import { env } from '../utils/env';

interface WorkerFixtures {
  /** A signed in API client per role, shared by the tests of one worker. */
  api: ApiByRole;
}

interface TestFixtures {
  /** An API client without a token, for the checks that must answer 401. */
  anonymousApi: ApiClient;
  /**
   * Opens the UI as a role without going through the login form, by putting that role's token where the UI keeps it.
   * The login form itself is tested in tests/e2e/login.spec.ts.
   */
  signInAs: (role: Role, path?: string) => Promise<Page>;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  api: [
    async ({ playwright }, use) => {
      const request = await playwright.request.newContext({ baseURL: env.apiUrl });
      const clients = {} as ApiByRole;
      for (const role of ROLES) {
        const { email, password } = credentials(role);
        clients[role] = await ApiClient.signIn(request, email, password);
      }
      await use(clients);
      await request.dispose();
    },
    { scope: 'worker' }
  ],

  anonymousApi: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({ baseURL: env.apiUrl });
    await use(new ApiClient(request));
    await request.dispose();
  },

  signInAs: async ({ page, api }, use) => {
    await use(async (role, path = '/') => {
      const token = api[role].token!;
      // The UI reads the token from sessionStorage (apps/frontend/src/auth/session.ts) before it renders.
      await page.addInitScript((value) => window.sessionStorage.setItem('hwp.accessToken', value), token);
      await page.goto(path);
      return page;
    });
  }
});

export { expect };
