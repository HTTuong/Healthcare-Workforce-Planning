import { defineConfig, devices } from '@playwright/test';
import { env } from './utils/env';

// Two kinds of tests against a running stack: api (no browser, fast) and e2e (Chromium through the UI). Both wait
// for the setup project, which prepares one account per role. Start the API and the UI first (see README.md).
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A retry is reported as flaky, never as a plain pass (playwright-report and JUnit keep both attempts).
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'Europe/Helsinki',
    locale: 'en-GB'
  },
  projects: [
    { name: 'setup', testDir: './tests/setup', testMatch: /.*\.setup\.ts/, use: { baseURL: env.apiUrl } },
    { name: 'api', testDir: './tests/api', dependencies: ['setup'], use: { baseURL: env.apiUrl } },
    { name: 'e2e', testDir: './tests/e2e', dependencies: ['setup'], use: { ...devices['Desktop Chrome'], baseURL: env.uiUrl } }
  ]
});
