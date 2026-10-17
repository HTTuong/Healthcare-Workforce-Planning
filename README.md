# Healthcare Workforce Planning

A shift planning system for a hospital, built to practice test automation of business rules, role-based access and approval workflows. Planners generate staff schedules that must respect qualifications, availability, working-time limits and staffing levels; managers approve them; employees see their published shifts.

Status: in development. See [`docs/architecture.md`](docs/architecture.md) for the domain model and [`docs/business-rules.md`](docs/business-rules.md) for the scheduling rules under test.

## Planned stack

- **Backend:** NestJS, Prisma, PostgreSQL
- **Frontend:** React
- **Tests:** Vitest (unit tests, including the scheduling engine), Playwright (API and end-to-end)
- **Infrastructure:** Docker Compose, GitHub Actions

## Repository layout

```
apps/backend/    NestJS API
apps/frontend/   React UI
playwright/      API and end-to-end tests
docs/            architecture, business rules, risk analysis, test strategy
```
