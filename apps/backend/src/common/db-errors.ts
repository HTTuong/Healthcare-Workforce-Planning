// PostgreSQL ends one of two conflicting serializable transactions with SQLSTATE 40001. Prisma documents this as
// error P2034, but with the pg driver adapter of Prisma 7 it arrives as a DriverAdapterError whose cause has
// kind TransactionWriteConflict and originalCode 40001. That shape reached the client as 500 in the workflow smoke
// test, so both shapes are recognised here.

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

/** True when the database refused a transaction because a parallel one changed the data it read. Retrying may work. */
export function isWriteConflict(error: unknown): boolean {
  const cause = field(error, 'cause');
  return (
    field(error, 'code') === 'P2034' ||
    field(cause, 'originalCode') === '40001' ||
    field(cause, 'kind') === 'TransactionWriteConflict'
  );
}

/** How often a serializable transaction is tried before a write conflict reaches the client as 409 (F-11). */
export const WRITE_CONFLICT_ATTEMPTS = 5;

/** A short random pause that grows with each attempt, so transactions that refused each other do not meet again. */
function pauseBeforeRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * 20 * attempt));
}

/**
 * Runs a serializable transaction again when PostgreSQL ends it with 40001, as the PostgreSQL manual asks of clients.
 * A conflict is often false: PostgreSQL watches what a transaction read, and approval reads the work of the same
 * employees in every department, so two planners or managers working at the same moment can refuse each other (F-11).
 * Each attempt runs the whole transaction again, so it reads what the winner committed. After the last attempt the
 * conflict is thrown. The first version tried 3 times without a pause, which was not enough under the parallel
 * Playwright suite (2 of 334 tests failed on 07/11/2026).
 */
export async function retryOnWriteConflict<T>(
  run: () => Promise<T>,
  attempts = WRITE_CONFLICT_ATTEMPTS,
  pause: (attempt: number) => Promise<void> = pauseBeforeRetry
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isWriteConflict(error)) throw error;
      await pause(attempt);
    }
  }
}
