import { describe, expect, it } from 'vitest';
import { isWriteConflict } from './db-errors.js';

describe('isWriteConflict', () => {
  it('recognises the error Prisma documents', () => {
    expect(isWriteConflict({ code: 'P2034' })).toBe(true);
  });

  it('recognises the shape the pg driver adapter really threw in the workflow smoke test', () => {
    const observed = Object.assign(new Error('TransactionWriteConflict'), {
      name: 'DriverAdapterError',
      cause: {
        originalCode: '40001',
        originalMessage: 'could not serialize access due to read/write dependencies among transactions',
        kind: 'TransactionWriteConflict'
      }
    });
    expect(isWriteConflict(observed)).toBe(true);
    expect(isWriteConflict({ cause: { originalCode: '40001' } })).toBe(true);
    expect(isWriteConflict({ cause: { kind: 'TransactionWriteConflict' } })).toBe(true);
  });

  it('does not take other database errors for a conflict', () => {
    expect(isWriteConflict({ code: 'P2002' })).toBe(false);
    expect(isWriteConflict({ cause: { originalCode: '23505', kind: 'UniqueConstraintViolation' } })).toBe(false);
    expect(isWriteConflict(new Error('connection lost'))).toBe(false);
    expect(isWriteConflict(undefined)).toBe(false);
    expect(isWriteConflict('40001')).toBe(false);
  });
});
