# AI-Assisted Testing

This project was built and tested with an AI assistant (Claude) doing most of the writing, and a person deciding what to build, reviewing the work and running it on their own machine. This document records how that worked, the rules that kept the results trustworthy, and the mistakes the assistant made.

Last updated: 2026-11-09.

## What the assistant did

- Wrote the backend, the frontend, the unit tests, the Playwright suite, the Docker and CI files, and the documents, one lesson at a time.
- Ran the API, the UI and PostgreSQL in a scratch environment and ran every test there before handing anything over.
- Probed the product before writing tests for a group, to find the cases earlier groups had not tried.
- Put deliberate mistakes into the product code to check that each test group catches them.
- Investigated failing and flaky tests down to the cause, with logs, traces and small reproductions.

## What the person did

- Chose the lessons and their order, and decided between options the assistant set out (for example to go on with new groups before fixing F-13).
- Reviewed each lesson's report: what was done, its impact, and how to observe it.
- Committed and pushed, ran the stack on their own machine, and owns every product decision listed as an open question.

## Rules that kept the work honest

- Evidence first: a behavior is documented only after a real run showed it, with the run named.
- A test is trusted only after it failed on purpose: each group was checked with deliberate mistakes in the product code, and a test that let a mistake through was made stricter.
- Expected results come from the documents, not from the code under test, so the code cannot grade itself.
- A passing test is never changed to make new code pass. When a behavior changes on purpose, the test changes with it and the commit says so.
- A known wrong behavior is pinned (`PINNED`) instead of hidden, and fails when it changes.
- The assistant does not work around a limit of its environment: when a download or a protected file was refused, it said so and handed the step to the person.

## Where the assistant was wrong, and how it was caught

| What it assumed | What was true | Caught by |
|---|---|---|
| A full week of 21 shifts gives 21 assignments | The Sunday night ends on the next Monday and belongs to no period (BR-T03): 20 | The test failed on the first run |
| A person without a required qualification is reported as BR-H01 | It is reported as a BR-H06 shortage, by design | Reading the validation code after the test failed; the rule is now explained in `business-rules.md` |
| A requirement nobody holds leaves the shift empty | The engine fills the place anyway (D-01, open) | The test failed; the assertion now matches the pinned behavior |
| The first ECONNRESET came from Node's 5 s keep-alive | Node 22 closes after 5 s plus a 1 s buffer; the trace showed a 6.1 s gap | A test at 5 s found nothing, the trace and a test at 6 s found it (F-14) |
| Marking JWT_SECRET required in Compose is safe | It broke `docker compose up -d` for the database alone | Running `docker compose config` without a `.env` file |
| The mutation script measured every mistake | It ran the tests even when the change did not apply, or did not compile | A mistake that "survived" without changing anything; the script now stops in both cases |
| Two parallel publishes show a non-atomic status change | 2 requests rarely meet in the gap; 6 do | A deliberate mistake that survived |
| A retry of 3 is enough for serialization failures | Under the parallel group F tests it was not | 2 failing tests, then an index and 5 attempts with a pause (F-11) |
| A test that waits for the page to show an entry has seen all its loading | In development React loads twice (StrictMode) | A test that failed once in three runs |

Most of these were caught within the same lesson, because every test ran against the real stack before it was handed over and every group was checked with deliberate mistakes.

## Lessons

- An assistant writes plausible tests quickly; only running them against the real system, and breaking the system on purpose, shows which ones protect anything.
- A flaky test is a finding until proven otherwise: three of them were product defects (F-11, F-14) or a growing limit (F-13), not test problems.
- Documents written before the code (the rules, the role table) are what make independent expected results possible.
