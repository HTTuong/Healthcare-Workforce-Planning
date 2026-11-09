# Healthcare Workforce Planning

[![CI](https://github.com/HTTuong/Healthcare-Workforce-Planning/actions/workflows/ci.yml/badge.svg)](https://github.com/HTTuong/Healthcare-Workforce-Planning/actions/workflows/ci.yml)

A shift planning system for a hospital, built to practice test automation of business rules, role-based access and approval workflows. Planners generate staff schedules that must respect qualifications, availability, working-time limits and staffing levels; managers approve them; employees see their published shifts.

Status: in development. See [`docs/architecture.md`](docs/architecture.md) for the domain model and [`docs/business-rules.md`](docs/business-rules.md) for the scheduling rules under test.

## Planned stack

- **Backend:** NestJS, Prisma, PostgreSQL
- **Frontend:** React
- **Tests:** Vitest (unit tests, including the scheduling engine), Playwright (API and end-to-end)
- **Infrastructure:** Docker Compose, GitHub Actions

## Run with Docker Compose

`docker compose up -d` starts PostgreSQL alone on port 5433, for development with `npm run start:dev` and `npm run dev`.

The whole stack builds and runs with the `app` profile: the API on port 3000 and the UI, served by nginx, on port 8080.

```bash
cp .env.example .env                                   # set JWT_SECRET and ADMIN_PASSWORD
docker compose --profile app up -d --build
docker compose run --rm backend npm run create-admin   # the first admin, from .env
cd playwright && UI_URL=http://localhost:8080 npx playwright test
```

The API applies the database migrations when it starts. `docker compose --profile app down -v` removes the database too, which gives the next full test run a clean start.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request, in four stages that each wait for the one before:

1. Lint and type check: backend, frontend (with its production build) and the Playwright project.
2. Unit tests: backend with the 100 % coverage threshold of the scheduling engine, and frontend.
3. API, integration and end to end tests on a fresh PostgreSQL: the API and the built UI are started, the bash smoke tests check the role table and the workflow, then Playwright runs the API and browser tests. The HTML report and the JUnit results are kept for 14 days, the server logs when something fails.
4. Quality gate: passes only when every stage passed, no test failed, none was skipped, none passed only on its retry (`--fail-on-flaky-tests`) and `test.only` was not left in (`forbidOnly`).

## Repository layout

```
apps/backend/    NestJS API
apps/frontend/   React UI
playwright/      API and end-to-end tests
docs/            architecture, business rules, risk analysis, test strategy
```
