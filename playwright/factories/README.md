# Factories

Factories create the test data a test needs through the API, with unique names (`utils/unique.ts`), so tests can run in parallel and repeatedly against the same database.

- `users.ts`: the fixed account for each role that the tests sign in with.
- Domain factories for employees, shifts and schedules, such as `createEligibleEmployee()`, follow on day 30/11.
