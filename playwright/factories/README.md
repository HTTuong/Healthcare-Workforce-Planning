# Factories

Factories create the test data a test needs through the API. Each method is named after a business situation, so a test reads like the rule it checks, and the details of building that situation live in one place.

```ts
test('an unavailable nurse is not scheduled', async ({ factories }) => {
  const department = await factories.departments.create();
  await factories.shifts.create({ department, date: WEEK.monday });
  await factories.employees.createUnavailableEmployee({ department, from, to });
  const present = await factories.employees.createEligibleEmployee({ department });
  const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
  expect(schedule.assignments!.map((a) => a.employeeId)).toEqual([present.id]);
});
```

| Factory | Methods | Acts as |
|---|---|---|
| `departments` | `create()` | Admin |
| `qualifications` | `create()` | Admin |
| `employees` | `create()`, `createEligibleEmployee()`, `createUnavailableEmployee()`, `createEmployeeOnLeave()`, `createEmployeePreferring()`, `createEmployeeWithExpiredQualification()`, `createInactiveEmployee()` | Admin |
| `shifts` | `create()` with type, date, hours, headcount and required qualifications, in Helsinki time | Planner |
| `schedules` | `create()`, `createGenerated()`, `createInReview()`, `createApproved()`, `createPublished()` | Planner, then Manager |
| `users.ts` | the fixed account of each role that the tests sign in with | Admin, in the setup project |

Rules:

- Every test creates its own department. Shifts, schedules and scheduling candidates are per department, so tests cannot disturb each other, and they can all use the same week (`utils/test-week.ts`).
- Names, emails and codes are unique per run, worker and call (`utils/unique.ts`). Nothing is deleted afterwards, and nothing needs to be.
- Each factory acts as the role that does this in the product, so test data is created through the same permission checks as real data.
- A factory that cannot reach the state it promises fails the setup with the API's status and message. `createApproved()` also fails when the generated schedule breaks a hard rule.
- `tests/api/factories.spec.ts` checks every promise where it matters, in what the scheduling engine does with the data.
