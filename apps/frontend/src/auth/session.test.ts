import { describe, expect, it, vi } from 'vitest';
import { clearToken, getToken, setToken } from './session';

describe('session token', () => {
  it('keeps the token in sessionStorage', () => {
    setToken('abc');
    expect(sessionStorage.getItem('hwp.accessToken')).toBe('abc');
    expect(getToken()).toBe('abc');
    clearToken();
    expect(getToken()).toBeNull();
  });

  it('treats storage as the only source while it works', () => {
    setToken('abc');
    sessionStorage.clear();
    expect(getToken()).toBeNull();
  });

  it('falls back to memory when storage throws, for example with site data blocked', () => {
    const blocked = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    setToken('in-memory');
    expect(getToken()).toBe('in-memory');
    clearToken();
    expect(getToken()).toBeNull();
  });
});
