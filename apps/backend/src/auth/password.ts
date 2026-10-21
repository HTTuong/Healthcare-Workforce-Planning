import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as unknown as (password: string, salt: Buffer, keyLength: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

// Stored format: scrypt$<salt>$<key>, both base64. Every password gets its own random salt.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltValue, keyValue] = stored.split('$');
  if (scheme !== 'scrypt' || !saltValue || !keyValue) return false;
  const expected = Buffer.from(keyValue, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltValue, 'base64'), expected.length);
  // A constant time comparison, so the response time does not leak how many bytes matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}