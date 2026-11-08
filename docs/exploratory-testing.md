# Exploratory Testing - Healthcare Workforce Planning

This document records exploratory test sessions on the API and the UI. Each session has a charter, the areas covered, the findings with their status, and the questions it raised. The automated tests prove what we expected; these sessions look for what we did not expect.

## Session 1: API input, boundaries, sessions and parallel requests

Date: 2026-11-01.

Build: commit `22ae3c8` (day 10, ownership of availability), built with `tsc` and run with Node against PostgreSQL 16 in a scratch environment. The fixes were then verified on the same setup.

Charter: explore the API with malformed input, boundary values, account changes and parallel requests, to find failures that the unit tests and the smoke test do not cover.

Tools: curl from a shell, a small probe script, PostgreSQL queries to check what was stored, and the server log to find the root cause of every 500.

### Areas and heuristics

| Area | What was tried |
|---|---|
| Malformed input | Empty body, missing fields, wrong types, an array or a string as the body, broken JSON, a text/plain body, blank strings, objects in place of strings |
| Numeric boundaries | 0, negative numbers, 2147483647 and 2147483648 in paths, queries and bodies, very large headcounts |
| Dates and times | 30 February, 31 April, 29 February in leap and non leap years, the hour 24, offsets beyond +14:00, very long ranges, the year 1900 |
| Sessions and roles | A token after the account is deactivated, a token after a role change, the letter case of the Bearer scheme, login timing for known and unknown emails |
| Information leakage | Response headers, error messages of 500 responses |
| Parallel requests | 10 identical availability requests sent at the same time, repeated 5 times |
| Size | A 200 kB body, a 50 000 character name |

### Findings

| Id | Finding | Severity | Status | How it is checked now |
|---|---|---|---|---|
| F-01 | `POST /departments` had no input validation: an empty body, a missing name, numbers, an array or a text/plain body gave 500, and a code of only spaces was stored | Medium | Fixed | `departments.create.spec.ts`, smoke test "Input validation" |
| F-02 | A number above 2147483647 in a path, a query or a body gave 500 (Prisma P2020, PostgreSQL 22003), on departments, employees, shifts, staffing requirements, availability and passwords | Medium | Fixed with `ParseIdPipe` and an upper limit in `parsePositiveInt` | `parse-id.pipe.spec.ts`, `parse.spec.ts`, `availabilities.input.spec.ts`, `employees.input.spec.ts`, smoke test |
| F-03 | A day that does not exist was moved silently: 30 February 2027 was stored as 2 March and 31 April as 1 May, for availability and shifts | Medium | Fixed: every part of a timestamp is checked, and the hour 24 is rejected | `parse.spec.ts`, `availabilities.input.spec.ts`, smoke test |
| F-04 | A deactivated employee kept full access with an existing token for up to 8 hours, and could still record leave. A role change only applied when the token expired | High | Fixed with `ActiveUserGuard`, which loads the account on every request | `active-user.guard.spec.ts`, smoke test "Account state" |
| F-05 | Parallel identical availability requests stored overlapping rows: 2 to 3 rows in 4 of 5 rounds of 10 requests, because the overlap check runs before the insert (R-CONC-01) | Medium | Open, a database exclusion constraint is planned | Repeat the parallel test after the constraint is added |
| F-06 | Every response carried `X-Powered-By: Express` | Low | Fixed | Smoke test "Input validation" |
| F-07 | No upper limits: a shift of 30 days, a shift in 1900, a headcount of 1 000 000, an availability of 5 years and a name of 50 000 characters were all accepted | Low | Open question for the product owner | |
| F-08 | Department codes are case sensitive, so `QA` and `qa` can both exist | Low | Open question | |
| F-09 | A password of 12 spaces is accepted, because only the length is checked | Low | Open question on the password policy | |
| F-10 | The Bearer scheme is case sensitive (`bearer` gives 401), while the HTTP standard says the scheme name is case insensitive | Low | Accepted for now, clients send `Bearer` | |
| F-11 | Found by the Playwright suite on 06/11/2026, not in a session. Creating a schedule could answer 409 "Another change to these schedules happened at the same time" although nobody else touched that department: 3 of 91 tests failed in 2 of 3 runs with 4 workers. The PostgreSQL log showed "could not serialize access due to read/write dependencies" on the insert. The serializable check for an overlapping period reads `Schedule` without an index on `departmentId`, so PostgreSQL watches the whole table, and a create and an approval in different departments can refuse each other. The API turned the first refusal into 409, while the PostgreSQL manual asks clients to retry | Medium | Fixed: create and approve run the transaction again (`retryOnWriteConflict`). On 07/11/2026 the group F tests, which create and approve many schedules at once, still failed 2 of 334 tests after 3 attempts: the retry now makes 5 attempts with a short random pause, and an index on `Schedule(departmentId, periodStart)` lets the overlap check read only its department (migration `20261107000000_add_schedule_department_index`). Approval still reads the work of its employees in every department, so some conflicts remain and are retried | `db-errors.spec.ts`, `schedules.service.spec.ts`; 3 runs of the Playwright suite with 4 workers passed while the database refused 7 transactions that the retry repeated |
| F-12 | Found by the Playwright suite on 07/11/2026. After a planner raised the headcount of a shift, its OPTIMIZED schedule stayed OPTIMIZED, and generate is allowed only from DRAFT, so the new place could be filled only by a hand edit first. Submitting the stale schedule was possible, approval then refused it | Low | Fixed: a change to a shift sends an OPTIMIZED schedule that shows it back to DRAFT, as a hand edit does | `shifts.service.spec.ts`, `c-shifts.spec.ts` T16 |
| F-13 | Found by the Playwright suite on 07/11/2026. `GET /employees` and the employee list have no paging: with the 11,602 employees the repeated test runs left in the scratch database, the response is about 2 MB and the page renders every row, which took 3.7 to 4.6 s without load. A real organisation with thousands of staff would see the same. By the end of 07/11/2026 the list held 18,768 employees, one smoke test of the list took 12 s alone, and it failed twice under 4 workers. Later the same day, with 20,993 employees, the smoke test failed in every repetition of a parallel run and a full run took 3.4 min instead of 2.4 | Medium | Open: paging or a server-side search is a product change. Until then a scratch database should be reset before full parallel runs. The Playwright test that read the whole list now reads the new employee by id | Page timing script, `a-employees.spec.ts` |
| F-14 | Found by the Playwright suite on 07/11/2026: a request now and then failed with ECONNRESET (about one parallel run in three), always the first request of a test on a connection that had been idle for about 6 s. Node closes an idle connection after 5 s plus a 1 s buffer, and a client that reuses it at that moment gets a reset. Reproduced with idle times around 6 s (1 reset in 21 requests). A proxy that reuses connections, such as nginx or a load balancer, can turn the same race into a 502 for users | Medium | Fixed: idle connections stay open 65 s, longer than the 60 s of common proxies, with the headers timeout above it (`configureKeepAlive`). The reproduction gave 0 resets in 21, and 3 parallel runs of 334 tests passed | `http-server.spec.ts`, reproduction script, Playwright suite |
| F-15 | Found by the Playwright group G tests on 07/11/2026. The token was read by splitting the Authorization header on spaces and taking two parts, so `Bearer <token> extra` was accepted. Not a way around the signature, but a malformed header should be refused | Low | Fixed: only exactly `Bearer <token>` is read (RFC 6750); the scheme stays case sensitive (F-10) | `auth.guard.spec.ts` fails on the old code, `g-rbac.spec.ts` |
| F-16 | Found by the Playwright group I probe on 08/11/2026. Two shifts with the same department, type, start and end are both stored (201 twice), so the ward needs twice the people for those hours. That may be intended for two teams on the same hours, or be a request sent twice by a client that retried | Low | Open question for the product owner; pinned in `i-negative.spec.ts` (`PINNED F-16`) | |

### What worked as intended

- Broken JSON gives 400, and a body above 100 kB gives 413.
- An object sent as an email (`{"$ne": ""}`) is rejected with 400 at login.
- Login takes about the same time for a known and an unknown email (44 ms and 41 ms on average over 5 tries), so the response time does not tell which emails exist.
- The generic 500 response did not leak stack traces or database details. The details stayed in the server log, which is where the root causes were found.
- All other endpoints already rejected wrong types with 400.

### Verification after the fixes

The 19 requests that had given 500 or a moved date were sent again: all returned 400 with a clear message, and the server logged no error. The smoke test passed twice with 0 failures, including its new "Account state" and "Input validation" sections. The unit tests grew from 89 to 111.

### Questions for the product owner

- What is the longest allowed shift, and how far in the past or future can shifts and availability be planned?
- Is there a maximum headcount for a shift?
- Should department codes be stored in upper case so that `ER` and `er` are the same code?
- What password rules apply beyond a length of 12 to 128 characters?

## Session 2: the whole UI, flow by flow

Date: 2026-11-05.

Build: the frontend after day 27/11 (RBAC on the UI), run with the Vite dev server against the API and PostgreSQL 16 in a scratch environment.

Charter: click through every flow of every role in a browser, with the situations the component tests do not reach: the browser's own buttons, odd addresses, narrow screens, very long data, a server that stops answering, and assistive technology.

Tools: Chromium driven by Playwright scripts that record what a tester would see, axe-core 4 for accessibility, screenshots, and the server log. The steps were scripted so they can be repeated exactly, but each one was chosen and its result judged by hand.

### Areas and heuristics

| Area | What was tried |
|---|---|
| Accessibility | axe-core with the WCAG 2.1 AA and best practice rules on 11 views, including the login errors, in light and dark mode. Tab titles. Focus after following a link |
| Addresses | `/schedules/abc`, `/employees/abc/edit`, `/shifts/abc/edit`, an id above 2147483647, a deep link with a query opened while signed out |
| Browser buttons | Back after signing out, reload on every page |
| Screen sizes | 320, 390 and 1200 px wide |
| Data | The 50,000 character department name left by session 1 (F-07) in every list and form that shows departments |
| Double actions | Double click on the save buttons |
| Server down | The API stopped while a user is signed in, then a reload |
| Regression | All seven browser scripts of days 21 to 27/11, 105 checks |

### Findings

| Id | Finding | Severity | Status | How it is checked now |
|---|---|---|---|---|
| U-01 | Every page had the same tab title, so tabs, history and screen readers could not tell the pages apart (WCAG 2.4.2) | Low | Fixed: each page sets its own title, a schedule by its department and period | `ui-findings.test.tsx` |
| U-02 | An address that names no record, such as `/schedules/abc`, showed the API's message "Expected a positive integer id" | Low | Fixed: the page checks the id first and says the record does not exist, without calling the API | `route-id.test.ts`, `ui-findings.test.tsx` |
| U-03 | A link with a query, such as `/shifts?week=2026-10-19`, opened while signed out lost its query after login | Low | Fixed: the login page returns to the path and the query | `ui-findings.test.tsx` |
| U-04 | At 320 px every page was 409 px wide, because the navigation links did not wrap | Low | Fixed: the links wrap | browser script at 320 px |
| U-05 | When the API stopped answering, a reload showed the login page with no message, which looked like being signed out although the token was kept | Medium | Fixed: the page says the server cannot be reached, keeps the user signed in and offers Try again and Sign out. The Vite proxy answers 500 when the API is down, which the UI treats the same way | `LoginPage.test.tsx` (the earlier test that expected the login page was changed on purpose), browser script |

Each fix was checked by putting the old code back: the tests named above failed each time.

### What worked as intended

- axe-core found no violations on any of the 11 views in light or dark mode.
- Back after signing out returns to the login page, not to the signed in page.
- A double click on a save button sends one request, because the button is disabled while the request runs.
- The 50,000 character department name no longer widens any page (fixed on day 23/11). The name itself is still accepted by the API (F-07, open).
- All 105 checks of the earlier browser scripts pass after the fixes. One script assumed a department name that later scripts had changed, which was a problem of the script, not of the UI.
- A shift form test failed once when its file ran alone, because it checked a request before the list had loaded. It now waits for the list.

### Observations without a change

- After following a link, focus stays on the link. The new tab title is announced, but screen reader users do not hear the new heading. Moving focus to the heading on every page change is a candidate for a later lesson.
- Signing out ends the session in that browser tab only, because each tab keeps its own token. The API cannot revoke a token before it expires (see `architecture.md`).
- Leaving a form with unsaved changes asks nothing.

## How to repeat a session

- `apps/backend/http/api.http` holds the requests used for manual testing, including one per finding. Open it in VS Code with the REST Client extension.
- `npm run rbac-smoke` in `apps/backend` repeats the automated part against a running API.
- `npm test` in `apps/frontend` repeats the component tests, including one per UI finding in `src/layout/ui-findings.test.tsx`.
