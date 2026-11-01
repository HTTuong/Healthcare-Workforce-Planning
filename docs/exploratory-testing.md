# Exploratory Testing - Healthcare Workforce Planning

This document records exploratory test sessions on the API. Each session has a charter, the areas covered, the findings with their status, and the questions it raised. The automated tests prove what we expected; these sessions look for what we did not expect.

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

## How to repeat a session

- `apps/backend/http/api.http` holds the requests used for manual testing, including one per finding. Open it in VS Code with the REST Client extension.
- `npm run rbac-smoke` in `apps/backend` repeats the automated part against a running API.
