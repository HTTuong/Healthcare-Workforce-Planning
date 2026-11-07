import { describe, expect, it, vi } from 'vitest';
import { isWriteConflict, retryOnWriteConflict, WRITE_CONFLICT_ATTEMPTS } from './db-errors.js';

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

describe('retryOnWriteConflict (F-11)', () => {
  const conflict = { cause: { originalCode: '40001', kind: 'TransactionWriteConflict' } };

  it('runs the transaction again after a conflict and returns what the next attempt gives', async () => {
    const run = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce('created');
    await expect(retryOnWriteConflict(run)).resolves.toBe('created');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last attempt and throws the conflict', async () => {
    const run = vi.fn().mockRejectedValue(conflict);
    await expect(retryOnWriteConflict(run, 3)).rejects.toBe(conflict);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('tries 5 times by default and pauses longer before each new attempt', async () => {
    const run = vi.fn().mockRejectedValue(conflict);
    const pause = vi.fn().mockResolvedValue(undefined);
    await expect(retryOnWriteConflict(run, undefined, pause)).rejects.toBe(conflict);
    expect(WRITE_CONFLICT_ATTEMPTS).toBe(5);
    expect(run).toHaveBeenCalledTimes(5);
    expect(pause.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2, 3, 4]);
  });

  it('never repeats a transaction that failed for another reason', async () => {
    const notFound = { code: 'P2003' };
    const run = vi.fn().mockRejectedValue(notFound);
    await expect(retryOnWriteConflict(run)).rejects.toBe(notFound);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
