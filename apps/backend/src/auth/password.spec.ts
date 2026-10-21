import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('accepts the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('correct horse battery');
    await expect(verifyPassword('correct horse battery', stored)).resolves.toBe(true);
    await expect(verifyPassword('correct horse batterz', stored)).resolves.toBe(false);
  });

  it('never stores the password itself and uses a new salt every time', async () => {
    const first = await hashPassword('same password 123');
    const second = await hashPassword('same password 123');
    expect(first).not.toContain('same password 123');
    expect(first.startsWith('scrypt$')).toBe(true);
    expect(first).not.toEqual(second);
  });

  it('refuses a stored value in an unknown or damaged format', async () => {
    await expect(verifyPassword('anything', 'plaintext')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'bcrypt$a$b')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'scrypt$only-one-part')).resolves.toBe(false);
  });
});