# Frontend

React user interface of Healthcare Workforce Planning, built with Vite, TypeScript and React Router.

## Run

The API must run on port 3000 (see `apps/backend`).

```bash
npm install
npm run dev
```

Open http://localhost:5173 and sign in with an account created by `npm run create-admin` or by an admin. The UI calls `/api/...` on its own origin, and Vite forwards those requests to the API, so the API needs no CORS settings. Set `API_URL` to use another API address.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server with hot reload on port 5173 |
| `npm run build` | Type check, then a production build in `dist/` |
| `npm run preview` | Serves the production build on port 4173, with the same `/api` forwarding |
| `npm test` | Vitest with Testing Library in jsdom |
| `npm run lint` | oxlint, including accessibility rules |

## Structure

```
src/api/client.ts        the only code that calls the API, turns errors into ApiError
src/auth/                session token, AuthProvider, useAuth, RequireAuth, RequireRole, role checks
src/layout/              the top bar and navigation around every signed in page
src/employees/           employee list, create and edit form, set password
src/shifts/              weekly shift list, shift form with required qualifications
src/availability/        my availability: available, unavailable and leave
src/schedules/           schedule list and schedule view
src/time/helsinki.ts     the only code that converts between Helsinki local time and instants
src/pages/               login and home pages
src/test/                test setup, a fake API that fails on unexpected requests, renderApp
```

## Sign in and session

- The login page calls `POST /auth/login`, then `GET /auth/me` for the name, role and department.
- The token is kept in sessionStorage, so a reload keeps the session and closing the tab ends it.
- Any request with a token that gets 401 ends the session and the login page says so. This covers an expired token and an account an admin deactivated.
- Signing out forgets the token in this browser only. The API cannot revoke a token before it expires (see `docs/architecture.md`).

## Pages

| Path | Who | What |
|---|---|---|
| `/login` | everyone | Sign in |
| `/` | signed in | Name, role and department |
| `/employees` | Admin, Planner, Manager | Employee list with search, role filter and inactive filter |
| `/employees/new`, `/employees/:id/edit` | Admin | Create or edit an employee, deactivate, set a password |
| `/schedules`, `/schedules/:id` | everyone | Staff: every schedule, its shifts by day with gaps, the hard rule check, scores and work per employee. Employee: own shifts of published schedules |
| `/schedules/new` | Admin, Planner | Start a draft schedule for a department and a period of 1 to 42 days |
| `/availability` | everyone | Own availability: add, change and delete entries, whole days or times |
| `/shifts?week=&department=` | Admin, Planner, Manager | One week of shifts in Helsinki time |
| `/shifts/new`, `/shifts/:id/edit` | Admin, Planner | Create, edit or delete a shift and its required qualifications |

The UI hides links and pages a role cannot use, and a role that types the address of such a page sees "No access". The API enforces the same rules on every request.

## Time

Shift times are typed and shown in Helsinki time and sent to the API with the offset of that day, for example `2026-10-24T22:00:00+03:00`. An end time at or before the start time ends the next day. The form shows the real length, so the night of the October clock change is 9 hours and the March one 7 hours (BR-T02). A time in the hour that the March change skips is refused, and a time that happens twice in October means the first one.

## Schedule workflow

The buttons on a schedule come from the `actions` field of `GET /schedules/:id`, which the API builds from the same table it uses to check permissions and statuses. The UI therefore offers only the steps the API accepts for this role and status. Publish and send back ask for confirmation. After each step the page reads the schedule again before the buttons work again, so a finished step cannot be clicked twice. While a schedule is a draft or optimized, a planner can add and remove people by hand, which moves it back to draft.
