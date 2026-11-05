import { expect, test } from '../../fixtures/test';
import { ROLES } from '../../api/types';
import { credentials } from '../../factories/users';

test.describe('authentication', { tag: '@smoke' }, () => {
  test('every role signs in and the profile shows its role', async ({ api }) => {
    for (const role of ROLES) {
      const me = await api[role].me();
      expect(me.role, role).toBe(role);
      expect(me.email, role).toBe(credentials(role).email);
    }
  });

  test('a wrong password and an unknown email get the same 401 message', async ({ anonymousApi }) => {
    const wrong = await anonymousApi.post('/auth/login', { email: credentials('EMPLOYEE').email, password: 'Wrong-Password-1' });
    const unknown = await anonymousApi.post('/auth/login', { email: 'nobody@example.com', password: 'Wrong-Password-1' });
    expect(wrong.status()).toBe(401);
    expect(unknown.status()).toBe(401);
    expect((await wrong.json()).message).toBe((await unknown.json()).message);
  });

  test('a request without a token gets 401', async ({ anonymousApi }) => {
    expect((await anonymousApi.get('/auth/me')).status()).toBe(401);
    expect((await anonymousApi.get('/employees')).status()).toBe(401);
  });

  test('an employee cannot list employees (403)', async ({ api }) => {
    expect((await api.EMPLOYEE.get('/employees')).status()).toBe(403);
  });
});
