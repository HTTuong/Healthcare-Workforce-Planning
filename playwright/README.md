# Playwright tests

API and end-to-end tests of Healthcare Workforce Planning, written with Playwright Test in TypeScript. They run against a running stack: the API on port 3000 and the UI on port 5173.

## Run

```bash
cp .env.example .env          # then set ADMIN_EMAIL and ADMIN_PASSWORD
npm install
npx playwright install chromium
npm test                      # setup, then api and e2e
npm run test:smoke            # only the tests tagged @smoke
npx playwright test --grep @groupA   # one test group; --grep @T03 runs one test case
npm run report                # the HTML report of the last run
```

Start the API (`apps/backend`, `npm run start:dev`) and the UI (`apps/frontend`, `npm run dev`) first. The admin is the account created with `npm run create-admin`.

In CI (`CI=1`) a failed test is retried once and reported as flaky, and the workflow fails on any flaky test. `scripts/junit-summary.mjs` writes the run's totals and failed tests to the run page and fails when no test ran or a test was skipped.

## Structure

```
playwright.config.ts   projects setup, api and e2e; HTML, JUnit and list reporters; traces on failure
api/                   ApiClient: one signed in client per user, raw requests and short domain calls
pages/                 page objects: AppShell, LoginPage, EmployeesPage, EmployeeFormPage
fixtures/test.ts       api (a client per role, per worker), anonymousApi, signInAs(role, path), factories
factories/             test data by business meaning (see factories/README.md)
utils/                 env, unique names, Helsinki time, the shared test week
tests/setup/           runs first: one account per role with a known role, state and password
tests/api/             API tests, no browser
tests/e2e/             browser tests through the UI
```

## Conventions

- Locators use roles, labels and text, as a user finds things. A test that needs a CSS class says why.
- Everything a test creates gets a unique name from `utils/unique.ts`, so tests run in parallel and again without cleaning up first.
- `signInAs` puts a role's token where the UI keeps it, so most browser tests skip the login form. The form itself is tested in `tests/e2e/login.spec.ts`.
- A failed setup call reports the method, the path, the status and the API's message.
- Retries are off locally and 1 in CI. A test that passes on retry is reported as flaky, not as a pass.
- Tests are tagged by group (`@smoke`, `@factories`, then the test groups A to I named in `docs/risk-analysis.md`).
- A test named `PINNED` records a known wrong behavior on purpose. It fails when the behavior is fixed, and changes together with the fix.

`@playwright/test` is pinned to 1.56.0, the version whose Chromium the scratch environment that ran these tests provides. Moving to a newer version needs `npx playwright install chromium` again.
