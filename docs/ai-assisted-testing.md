# AI-Assisted Development and Testing

I built this project with Claude Code as an AI pair programmer. I wrote the core logic myself and owned the product and the quality decisions; the assistant drafted the repetitive parts, helped me check syntax and hunt bugs, and nothing went in until I had reviewed it and seen it pass against the real stack. This document records how we split the work, the rules that kept the results trustworthy, and the mistakes the assistant made that the process caught.

Last updated: 2026-11-10.

## What I owned

- The product: the business rules (`business-rules.md`), the roles and permission table, the planning workflow and every open product decision (D-01, F-07 to F-10, F-16).
- The quality approach: the risk analysis and the test strategy, written before the code, the test groups A to I and their order, and the exit criteria in CI.
- The direction of the work: I planned each lesson, chose between the options the assistant set out (for example to continue with new test groups before fixing F-13), and decided when a finding was a defect, an open question or accepted behaviour.
- Review and verification: I reviewed every change, ran the stack and the suites on my own machine, and committed and pushed every change myself.
- The core logic: I wrote the scheduling rules (the hard constraint checks, rest and weekly-hour limits, qualification and staffing checks) and the role-based permission checks myself.

## What the assistant did

- Drafted the repetitive parts from the rules and the plan I gave it: API boilerplate, form components, test scaffolding, the Docker and CI files and first drafts of the documents.
- Helped me check syntax and hunt bugs in the code I wrote.
- Ran the API, the UI and PostgreSQL in a scratch environment and ran every test there before handing a change to me.
- Probed the product before a new test group was written, to find cases the earlier groups had not tried.
- Put deliberate mistakes into the product code so we could check that each test group catches them.
- Investigated failing and flaky tests down to the cause, with logs, traces and small reproductions, for me to confirm.

## Rules that kept the work honest

- Evidence first: a behaviour is documented only after a real run showed it, with the run named.
- A test is trusted only after it failed on purpose: each group was checked with deliberate mistakes in the product code, and a test that let a mistake through was made stricter.
- Expected results come from the documents, not from the code under test, so the code cannot grade itself.
- A passing test is never changed to make new code pass. When a behaviour changes on purpose, the test changes with it and the commit says so.
- A known wrong behaviour is pinned (`PINNED`) instead of hidden, and fails when it changes.
- When the assistant hit a limit of its environment, such as a refused download, it said so and handed the step to me instead of working around it.

## Where the assistant was wrong, and how it was caught

| What it assumed | What was true | Caught by |
|---|---|---|
| A full week of 21 shifts gives 21 assignments | The Sunday night ends on the next Monday and belongs to no period (BR-T03): 20 | The test failed on the first run |
| A person without a required qualification is reported as BR-H01 | It is reported as a BR-H06 shortage, by design | Reading the validation code after the test failed; the rule is now explained in `business-rules.md` |
| A requirement nobody holds leaves the shift empty | The engine fills the place anyway (D-01, open) | The test failed; the assertion now matches the pinned behaviour |
| The first ECONNRESET came from Node's 5 s keep-alive | Node 22 closes after 5 s plus a 1 s buffer; the trace showed a 6.1 s gap | A test at 5 s found nothing, the trace and a test at 6 s found it (F-14) |
| Marking JWT_SECRET required in Compose is safe | It broke `docker compose up -d` for the database alone | Running `docker compose config` without a `.env` file |
| The mutation script measured every mistake | It ran the tests even when the change did not apply, or did not compile | A mistake that "survived" without changing anything; the script now stops in both cases |
| Two parallel publishes show a non-atomic status change | 2 requests rarely meet in the gap; 6 do | A deliberate mistake that survived |
| A retry of 3 is enough for serialization failures | Under the parallel group F tests it was not | 2 failing tests, then an index and 5 attempts with a pause (F-11) |
| A test that waits for the page to show an entry has seen all its loading | In development React loads twice (StrictMode) | A test that failed once in three runs |

Most of these were caught within the same lesson, because every test ran against the real stack before I accepted it and every group was checked with deliberate mistakes.

## What I learned

- An assistant writes plausible tests quickly; only running them against the real system, and breaking the system on purpose, shows which ones protect anything.
- A flaky test is a finding until proven otherwise: three of them were product defects (F-11, F-14) or a growing limit (F-13), not test problems.
- Documents written before the code (the rules, the role table) are what make independent expected results possible, and they are what let me judge the assistant's work instead of trusting it.
