# Business Rules - Healthcare Workforce Planning

Every rule has an id. Tests reference these ids in their names and tags, so a failing test points straight to the rule it protects. Values marked "default" are configurable design assumptions, not legal advice.

Last updated: 2026-10-17.

## Hard constraints (must never be broken)

A schedule with any hard violation cannot be approved.

| Id | Rule | Default value | Test group |
|---|---|---|---|
| BR-H01 | An employee is assigned only to shifts whose required qualifications they hold, and the qualification is valid on the shift date | | D, I |
| BR-H02 | An employee is not assigned during a time they marked UNAVAILABLE or LEAVE | | B, D |
| BR-H03 | An employee is not assigned to two shifts that overlap in time | | D, I |
| BR-H04 | An employee does not exceed the maximum working hours in a week | 40 h per week | D |
| BR-H05 | Between the end of one shift and the start of the next there is a minimum rest period | 11 h | D |
| BR-H06 | Every shift reaches its required headcount, including the required number of each qualification | | C, D |
| BR-H07 | Only active employees can be assigned | | A, D |

## Soft constraints (scored, not enforced)

The engine tries to improve these and reports a quality score from 0 to 100.

| Id | Goal | Measured as |
|---|---|---|
| BR-S01 | Match employee preferences | Share of assignments in time the employee marked AVAILABLE as preferred |
| BR-S02 | Fair distribution of unpopular shifts | Spread of night and weekend shifts between employees |
| BR-S03 | Balanced workload | Spread of assigned hours relative to contract hours |
| BR-S04 | Minimize overtime | Hours above contract hours, summed over all employees |

The weights of the soft constraints are decided when the scoring is implemented (days 17/11 and 18/11) and recorded here.

## Workflow rules

| Id | Rule | Test group |
|---|---|---|
| BR-W01 | Only DRAFT and OPTIMIZED schedules can be edited | F |
| BR-W02 | A schedule can be published only after it is APPROVED | F |
| BR-W03 | A schedule with hard violations cannot move to APPROVED | E, F |
| BR-W04 | Employees see only PUBLISHED schedules | F, G |

## Access rules

| Id | Rule | Test group |
|---|---|---|
| BR-A01 | Every endpoint except login requires a valid token | G |
| BR-A02 | Each role can do only what the permission table in `architecture.md` allows | G |
| BR-A03 | An employee can read and change only their own availability and see only their own shifts | G, I |

## Time rules

| Id | Rule |
|---|---|
| BR-T01 | Times are stored in UTC and displayed in Europe/Helsinki time |
| BR-T02 | A shift may cross midnight. Its length and rest periods are calculated from real elapsed time, so a night shift across a daylight saving change is 7 or 9 hours |
| BR-T03 | Shifts, availability and assignments must fall inside the schedule's planning period |
