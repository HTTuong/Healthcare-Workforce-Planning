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
src/auth/                session token, AuthProvider, useAuth, RequireAuth
src/pages/               one component per page
src/test/                test setup, a fake API that fails on unexpected requests, renderApp
```

## Sign in and session

- The login page calls `POST /auth/login`, then `GET /auth/me` for the name, role and department.
- The token is kept in sessionStorage, so a reload keeps the session and closing the tab ends it.
- Any request with a token that gets 401 ends the session and the login page says so. This covers an expired token and an account an admin deactivated.
- Signing out forgets the token in this browser only. The API cannot revoke a token before it expires (see `docs/architecture.md`).
