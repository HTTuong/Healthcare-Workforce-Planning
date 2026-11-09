# Test Strategy - Healthcare Workforce Planning

How this project is tested, why each layer exists, and where to find the test for every test case. The risks that drive the plan are in `risk-analysis.md`, the rules under test in `business-rules.md`.

Last updated: 2026-11-09 (checkpoint of Project 2).

## Approach

The plan started from risks, not from features: every risk in `risk-analysis.md` names the rule it threatens and the tests that cover it.

A test is trusted only after it has been seen to fail: for each test group, deliberate mistakes were put into the product code one at a time, and a group was finished only when every mistake was caught.

Expected results come from the documents, not from the code under test: the role table, the workflow table, the time rules and the soft scores are each written again in the tests from `architecture.md` and `business-rules.md`.

Only behavior confirmed by a real run is documented, and each finding gets an id, a severity, a status and the test that checks it (`exploratory-testing.md`).

## Test levels

| Level | Tool | What it covers | Size |
|---|---|---|---|
| Backend unit | Vitest | Validation, guards, services with a mocked database, and the scheduling engine as a pure function | 288 tests in 45 files |
| Engine coverage | Vitest with v8 coverage | Every statement, branch, function and line of `src/scheduling` | 100 %, enforced |
| Role contract | Vitest | The roles declared on all 42 routes against the expected table (`role-matrix.spec.ts`); the UI's permission table against the same table | Part of the unit tests |
| Frontend unit | Vitest and Testing Library | Pages, forms, time conversions and permissions in jsdom | 202 tests in 21 files |
| API smoke | bash and curl | Roles and the workflow against the running API (`rbac-smoke.sh`, `workflow-smoke.sh`) | 2 scripts |
| API | Playwright, no browser | Every test group against the running API and PostgreSQL | Part of 138 Playwright tests |
| End to end | Playwright, Chromium | The UI against the real API, in Helsinki time and British English | Part of 138 Playwright tests |
| Exploratory | By hand, timed sessions | What scripted tests do not look for | 2 sessions, `exploratory-testing.md` |

## Test design techniques

- Boundary values on both sides: exactly 11 h of rest and 10 h 59 min, exactly 40 h a week and 40 h 1 min, a qualification valid through its last local day, 42 and 43 day periods.
- Time zone and daylight saving: a 9 hour night across the autumn change, rest across the spring change (12 h on the clock, 11 real hours), a local time that does not exist (03:30 on the spring change).
- State transitions: every one of 5 schedule statuses tried with every one of 8 actions, against a table written from BR-W01 to BR-W03.
- Decision tables: 42 routes called by 5 identities (no token and four roles), 210 calls.
- Independent oracles: `utils/hard-rules.ts` checks overlap, rest and weekly hours, and `utils/soft-scores.ts` computes the four soft scores and the quality; both are written from the rules, and the time checker is tested on its own first.
- Property based checks with fixed seeds: 8 random weeks, each judged by the oracles; a failing seed can be run again exactly.
- Concurrency: 6 parallel publishes of one schedule, a parallel approve and send back, parallel suites with 4 workers to find false conflicts (F-11) and connection races (F-14).
- Negative testing: invalid times given where no other check can hide them, unknown and invalid ids, fields a caller may not set, hand edits that must never pass approval.
- Pinned tests: a test named `PINNED` records a known wrong or undecided behavior (D-01, four-eyes approval, F-16). It fails when the behavior changes, and changes together with the decision.

## Test data

- Factories create data by business meaning: an eligible employee, one on leave, one with an expired qualification, a schedule at each workflow step (`playwright/factories/README.md`).
- Every test creates its own department, so tests run in parallel and again without cleaning up.
- Names and emails are fake (`example.com`); no real person appears in tests or logs.
- The database is not cleaned between local runs. Test data piles up, and lists without paging slow down (F-13), so CI starts from an empty database every time, and a local full run should too (`docker compose --profile app down -v`).

## Environments

- Local: PostgreSQL from Docker Compose, the API and the UI from npm, Playwright with `API_URL` and `UI_URL`.
- Whole stack in containers: `docker compose --profile app up --build`, the UI served by nginx on port 8080.
- CI: GitHub Actions on every push and pull request, a new PostgreSQL service per run, the built UI served by Vite preview.

## Entry and exit criteria

- A change is ready for review when lint, type checks and the unit tests pass locally.
- A change is done when the CI quality gate passes: every stage green, no test failed, none skipped, none passed only on its retry, no `test.only`.
- A test group is done when its deliberate mistakes are all caught and three parallel runs of it pass.

## Traceability

Every test case has automated tests; the tag runs it alone (`npx playwright test --grep @T22`).

| Group | Test cases | Rules | Playwright files |
|---|---|---|---|
| A Employees | T01 to T06 | BR-H01, BR-H07, F-04 | `api/a-employees.spec.ts`, `e2e/a-employees.spec.ts` |
| B Availability | T07 to T11 | BR-H02, BR-S01, BR-A03 | `api/b-availability.spec.ts`, `e2e/b-availability.spec.ts` |
| C Shifts | T12 to T16 | BR-H06, BR-T02, BR-W01 (R-WF-02) | `api/c-shifts.spec.ts`, `e2e/c-shifts.spec.ts` |
| D Scheduling core | T17 to T23 | BR-H01 to BR-H07, BR-T03 | `api/d-scheduling-core.spec.ts`, `api/d-time-rules.spec.ts`, `e2e/d-*.spec.ts` |
| E Optimization | T24 to T28 | BR-S01 to BR-S04 | `api/e-optimization.spec.ts`, `e2e/e-optimization.spec.ts` |
| F Workflow | T29 to T32 | BR-W01 to BR-W04 | `api/f-workflow.spec.ts`, `e2e/f-workflow.spec.ts` |
| G Access | T33 to T37 | BR-A01 to BR-A03 | `api/g-rbac.spec.ts`, `e2e/g-rbac.spec.ts` |
| H API and UI consistency | H1 to H5 | BR-T01, BR-T02 | `e2e/h-consistency.spec.ts` |
| I Negative | T38 to T44 | BR-T01, BR-T03, BR-H03, BR-H07 | `api/i-negative.spec.ts`, `e2e/i-negative.spec.ts` |

49 test cases in total, run by 138 Playwright tests in 24 files plus the setup project.

## What is not tested

- Load and performance beyond the parallel suites; the employee list is a known limit (F-13).
- Browsers other than Chromium, and mobile layouts beyond the 320 px check of the second exploratory session.
- The Docker images and the GitHub workflow had not run outside the scratch environment at this checkpoint (see `risk-analysis.md`).
