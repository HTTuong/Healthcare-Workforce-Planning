# Business Rules - Healthcare Workforce Planning

Every rule has an id. Tests reference these ids in their names and tags, so a failing test points straight to the rule it protects. Values marked "default" are configurable design assumptions, not legal advice.

Last updated: 2026-11-01.

The exact definitions, the values allowed at each boundary and the daylight saving time cases are in `scheduling-engine.md`.

## Hard constraints (must never be broken)

A schedule with any hard violation cannot be approved.

| Id | Rule | Default value | Test group |
|---|---|---|---|
| BR-H01 | An employee is assigned only to shifts whose required qualifications they hold, and the qualification is valid for the whole shift | Valid through the local date in `validUntil` | D, I |
| BR-H02 | An employee is not assigned during a time they marked UNAVAILABLE or LEAVE | | B, D |
| BR-H03 | An employee is not assigned to two shifts that overlap in time | | D, I |
| BR-H04 | An employee does not exceed the maximum working hours in a week | 40 h per Monday to Sunday week in local time, exactly 40 h is allowed | D |
| BR-H05 | Between the end of one shift and the start of the next there is a minimum rest period | 11 h of real elapsed time, exactly 11 h is allowed | D |
| BR-H06 | Every shift reaches its required headcount, including the required number of each qualification | | C, D |
| BR-H07 | Only active employees can be assigned | | A, D |

## Soft constraints (scored, not enforced)

The engine tries to improve these and reports a quality score from 0 to 100.

| Id | Goal | Measured as |
|---|---|---|
| BR-S01 | Match employee preferences | Share of assignments that lie fully inside time the employee marked AVAILABLE, counting only employees who marked some AVAILABLE time. 100 when there are none |
| BR-S02 | Fair distribution of unpopular shifts | 100 x (1 - Gini coefficient) of night and weekend shifts per contract minute, over active employees. A weekend shift starts on a local Saturday or Sunday |
| BR-S03 | Balanced workload | 100 x (1 - Gini coefficient) of assigned real minutes per contract minute, over active employees |
| BR-S04 | Minimize overtime | Share of assigned minutes that are not overtime. Overtime is counted per local week, as the minutes the schedule adds above the contract once busy time outside the schedule is counted |

All four scores are implemented in `apps/backend/src/scheduling/soft-scores.ts`. The schedule quality score is their weighted average:

| Score | Weight | Reason |
|---|---|---|
| BR-S04 overtime | 0.30 | Costs money and wears staff out |
| BR-S01 preference | 0.25 | Staff wellbeing and trust in the schedule |
| BR-S02 fairness | 0.25 | Unpopular shifts shared evenly |
| BR-S03 workload | 0.20 | Partly covered by overtime and fairness already |

The weights are a design assumption to confirm with the product owner. The engine ranks candidates by the quality score after each assignment.

## Workflow rules

| Id | Rule | Test group |
|---|---|---|
| BR-W01 | Only DRAFT and OPTIMIZED schedules can be edited | F |
| BR-W02 | A schedule can be published only after it is APPROVED | F |
| BR-W03 | A schedule with hard violations cannot move to APPROVED | E, F |
| BR-W04 | Employees see only PUBLISHED schedules | F, G |

How the API applies them (day 20/11):
- BR-W01: adding or removing an assignment, generating and deleting are refused with 409 unless the schedule is DRAFT or OPTIMIZED. A hand edit moves an OPTIMIZED schedule back to DRAFT, and only an OPTIMIZED schedule can be submitted.
- BR-W02: publish is refused with 409 unless the schedule is APPROVED. PUBLISHED is final.
- BR-W03: approval validates the whole schedule again with the data of that moment and answers 409 with the list of violations, so an expired qualification or a schedule approved in the meantime is caught.
- BR-W04: an employee gets 404 for any schedule that is not PUBLISHED or that belongs to another department without one of their shifts, and sees only their own assignments.
- A planning period lasts 1 to 42 days, and periods of one department may not overlap. Both are design assumptions to confirm with the product owner.

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
| BR-T03 | Shifts and assignments must fall inside the schedule's planning period. Availability outside the period is ignored |
