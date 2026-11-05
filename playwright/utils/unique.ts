import { test } from '@playwright/test';

// Tests share one database, so everything they create gets a name no other test, worker or run can have. Then tests
// can run in parallel and again without cleaning up first.

const run = Date.now().toString(36);
let counter = 0;

/** A short id unique to this run, worker and call, for example "mh3k2x-w1-7". */
export function uniqueId(): string {
  counter += 1;
  return `${run}-w${test.info().workerIndex}-${counter}`;
}

/** An email address that no other test uses. example.com is reserved for examples, so no mail can reach anyone. */
export function uniqueEmail(prefix = 'pw'): string {
  return `${prefix}.${uniqueId()}@example.com`;
}
