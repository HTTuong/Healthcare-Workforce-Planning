# Healthcare Workforce Planning

[![CI](https://github.com/HTTuong/Healthcare-Workforce-Planning/actions/workflows/ci.yml/badge.svg)](https://github.com/HTTuong/Healthcare-Workforce-Planning/actions/workflows/ci.yml)

A shift planning system for a hospital, built to practice test automation of business rules, role-based access and approval workflows. Planners generate staff schedules that must respect qualifications, availability, working-time limits and staffing levels; managers approve and publish them; employees see their own published shifts.

The product exists to be tested: the rules were written down before the code, every risk is traced to the tests that cover it, and every finding is recorded with the test that now checks it.

## At a glance

- 49 test cases (T01 to T44, H1 to H5), all automated: 138 Playwright tests through the API and Chromium, plus a setup project.
- 288 backend unit tests, with the scheduling engine at 100 % coverage, enforced; 202 frontend unit tests.
- Each test group was checked with deliberate mistakes in the product code until every mistake was caught.
- Independent oracles: the time rules and the soft scores are computed again in the tests from the documented rules, and 8 random weeks from fixed seeds are judged by them.
- 23 findings recorded: 15 fixed, each with a test that fails on the old code; 2 open (F-05, F-13); 6 open questions or accepted behavior for the product owner (D-01, F-07 to F-10, F-16).

## Stack

- **Backend:** NestJS 12, Prisma 7 with the pg driver adapter, PostgreSQL
- **Frontend:** React 19, Vite 8, React Router, TypeScript
- **Tests:** Vitest and Testing Library (unit), bash and curl (smoke), Playwright 1.56 (API and end to end)
- **Infrastructure:** Docker Compose, nginx, GitHub Actions

## Run it locally

Requires Node 24 (`.nvmrc`) and Docker for PostgreSQL.

```bash
docker compose up -d                                   # PostgreSQL on port 5433

cd apps/backend
cp .env.example .env                                   # set JWT_SECRET (at least 32 characters)
npm install                                            # also generates the Prisma client
npx prisma migrate deploy
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='choose-12-chars+' npm run create-admin
npm run start:dev                                      # API on http://localhost:3000

cd ../frontend
npm install
npm run dev                                            # UI on http://localhost:5173
```

## Run the tests

```bash
cd apps/backend && npm test                            # backend unit tests
npm run test:engine                                    # engine with the 100 % coverage threshold
npm run rbac-smoke && npm run workflow-smoke           # against the running API

cd apps/frontend && npm test                           # frontend unit tests

cd playwright
cp .env.example .env                                   # the admin from create-admin
npm install && npx playwright install chromium
npx playwright test                                    # API and browser tests
npx playwright test --grep @groupD                     # one group; --grep @T22 runs one test case
npm run report                                         # the HTML report of the last run
```

The database keeps the test data of every run. For a full run, start from an empty database (`docker compose --profile app down -v`), as CI does: lists without paging slow down as data piles up (F-13).

## Run with Docker Compose

The whole stack builds and runs with the `app` profile: the API on port 3000 and the UI, served by nginx, on port 8080.

```bash
cp .env.example .env                                   # set JWT_SECRET and ADMIN_PASSWORD
docker compose --profile app up -d --build
docker compose run --rm backend npm run create-admin   # the first admin, from .env
cd playwright && UI_URL=http://localhost:8080 npx playwright test
```

The API applies the database migrations when it starts. Without the profile, `docker compose up -d` starts PostgreSQL alone, as before.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request, in four stages that each wait for the one before:

1. Lint and type check: backend, frontend (with its production build) and the Playwright project.
2. Unit tests: backend with the 100 % coverage threshold of the scheduling engine, and frontend.
3. API, integration and end to end tests on a fresh PostgreSQL: the API and the built UI are started, the bash smoke tests check the role table and the workflow, then Playwright runs the API and browser tests. The HTML report and the JUnit results are kept for 14 days, the server logs when something fails.
4. Quality gate: passes only when every stage passed, no test failed, none was skipped, none passed only on its retry (`--fail-on-flaky-tests`) and `test.only` was not left in (`forbidOnly`).

## Documents

| Document | What it holds |
|---|---|
| [`docs/business-rules.md`](docs/business-rules.md) | The hard and soft scheduling rules, workflow, access and time rules, with their boundaries |
| [`docs/architecture.md`](docs/architecture.md) | Domain model, roles and permissions, decisions and open questions |
| [`docs/scheduling-engine.md`](docs/scheduling-engine.md) | How the engine assigns people and how each rule is checked |
| [`docs/risk-analysis.md`](docs/risk-analysis.md) | Risk register and the evidence from real runs for each area |
| [`docs/test-strategy.md`](docs/test-strategy.md) | Test levels, techniques, test data, exit criteria and traceability of every test case |
| [`docs/exploratory-testing.md`](docs/exploratory-testing.md) | Exploratory sessions and every finding (F-01 to F-16, U-01 to U-05) |
| [`docs/ai-assisted-testing.md`](docs/ai-assisted-testing.md) | How an AI assistant was used, the rules that kept it honest, and its mistakes |

## Repository layout

```
apps/backend/    NestJS API, Prisma schema and migrations, scheduling engine, unit tests, smoke scripts
apps/frontend/   React UI and its unit tests
playwright/      API and end-to-end tests: api clients, page objects, fixtures, factories, oracles
docs/            rules, architecture, engine design, risks, strategy, findings
```
