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

/**
 * Runs a serializable transaction again when PostgreSQL ends it with 40001, as the PostgreSQL manual asks of clients.
 * A conflict is often false: without an index on the rows read, PostgreSQL watches the whole table, so two planners
 * creating schedules for different departments at the same moment could refuse each other (F-11). Each attempt runs
 * the whole transaction again, so it reads what the winner committed. After the last attempt the conflict is thrown.
 */
export async function retryOnWriteConflict<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isWriteConflict(error)) throw error;
    }
  }
}
