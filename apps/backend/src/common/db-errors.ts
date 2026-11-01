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
