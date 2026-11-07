import type { APIRequestContext } from '@playwright/test';
import type { Role } from '../../api/types';
import { expect, test } from '../../fixtures/test';

// Group G, role based access (BR-A01 to BR-A03). The expected table is written from the permission table in
// docs/architecture.md and its least-privilege rule for reads, not taken from role-matrix.spec.ts, and every route is
// called for real by every identity. Ids that do not exist keep the calls harmless: an allowed call answers 400 or
// 404, a refused one 401 (no identity) or 403 (wrong role), because the guards run before any lookup.

type Who = 'ANONYMOUS' | Role;
const WHO: Who[] = ['ANONYMOUS', 'ADMIN', 'PLANNER', 'MANAGER', 'EMPLOYEE'];
const ANY: Role[] = ['ADMIN', 'PLANNER', 'MANAGER', 'EMPLOYEE'];
const STAFF: Role[] = ['ADMIN', 'PLANNER', 'MANAGER'];
const SCHEDULING: Role[] = ['ADMIN', 'PLANNER'];
const APPROVAL: Role[] = ['ADMIN', 'MANAGER'];
const ADMIN: Role[] = ['ADMIN'];

const N = 2147483647;
const staffing = `/departments/${N}/staffing-requirements`;
// [method, path, who may, the case of the permission table]
const ROUTES: Array<[string, string, Role[] | 'PUBLIC', string]> = [
  ['GET', '/', 'PUBLIC', 'health'],
  ['GET', '/auth/me', ANY, 'own profile'],
  ['PUT', `/auth/password/${N}`, ADMIN, 'manage employees'],
  ['GET', '/departments', ANY, 'read: every role'],
  ['GET', `/departments/${N}`, ANY, 'read: every role'],
  ['POST', '/departments', ADMIN, 'manage departments'],
  ['PATCH', `/departments/${N}`, ADMIN, 'manage departments'],
  ['DELETE', `/departments/${N}`, ADMIN, 'manage departments'],
  ['GET', staffing, STAFF, 'read: staff'],
  ['PUT', `${staffing}/MORNING`, SCHEDULING, 'manage staffing requirements'],
  ['DELETE', `${staffing}/MORNING`, SCHEDULING, 'manage staffing requirements'],
  ['GET', '/qualifications', ANY, 'read: every role'],
  ['POST', '/qualifications', ADMIN, 'manage qualifications'],
  ['GET', '/employees', STAFF, 'read: staff'],
  ['GET', `/employees/${N}`, STAFF, 'read: staff'],
  ['POST', '/employees', ADMIN, 'manage employees'],
  ['PATCH', `/employees/${N}`, ADMIN, 'manage employees'],
  ['PUT', `/employees/${N}/qualifications/${N}`, ADMIN, 'manage employees'],
  ['DELETE', `/employees/${N}/qualifications/${N}`, ADMIN, 'manage employees'],
  ['GET', '/shifts', STAFF, 'read: staff'],
  ['GET', `/shifts/${N}`, STAFF, 'read: staff'],
  ['POST', '/shifts', SCHEDULING, 'manage shifts'],
  ['PATCH', `/shifts/${N}`, SCHEDULING, 'manage shifts'],
  ['DELETE', `/shifts/${N}`, SCHEDULING, 'manage shifts'],
  ['PUT', `/shifts/${N}/requirements/${N}`, SCHEDULING, 'manage shifts'],
  ['DELETE', `/shifts/${N}/requirements/${N}`, SCHEDULING, 'manage shifts'],
  ['GET', '/availabilities', ANY, 'own availability'],
  ['POST', '/availabilities', ANY, 'own availability'],
  ['PATCH', `/availabilities/${N}`, ANY, 'own availability'],
  ['DELETE', `/availabilities/${N}`, ANY, 'own availability'],
  ['GET', '/schedules', ANY, 'view published schedule'],
  ['GET', `/schedules/${N}`, ANY, 'view published schedule'],
  ['GET', `/schedules/${N}/check`, STAFF, 'read: staff'],
  ['POST', '/schedules', SCHEDULING, 'generate, edit and submit'],
  ['DELETE', `/schedules/${N}`, SCHEDULING, 'generate, edit and submit'],
  ['POST', `/schedules/${N}/generate`, SCHEDULING, 'generate, edit and submit'],
  ['POST', `/schedules/${N}/assignments`, SCHEDULING, 'generate, edit and submit'],
  ['DELETE', `/schedules/${N}/assignments/${N}`, SCHEDULING, 'generate, edit and submit'],
  ['POST', `/schedules/${N}/submit`, SCHEDULING, 'generate, edit and submit'],
  ['POST', `/schedules/${N}/approve`, APPROVAL, 'approve, reject and publish'],
  ['POST', `/schedules/${N}/reject`, APPROVAL, 'approve, reject and publish'],
  ['POST', `/schedules/${N}/publish`, APPROVAL, 'approve, reject and publish']
];

const call = (request: APIRequestContext, method: string, path: string, token?: string, data: object = {}) =>
  request.fetch(path, { method, data: method === 'GET' || method === 'DELETE' ? undefined : data, headers: token ? { Authorization: `Bearer ${token}` } : {} });

/** A token with one part changed, encoded as a JWT is. */
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const parts = (token: string) => token.split('.') as [string, string, string];
const payloadOf = (token: string) => JSON.parse(Buffer.from(parts(token)[1], 'base64url').toString()) as Record<string, unknown>;

test.describe('G: role based access (API)', { tag: '@groupG' }, () => {
  for (const who of WHO) {
    const tag = { ANONYMOUS: '@T33', ADMIN: '@T33', PLANNER: '@T34', MANAGER: '@T35', EMPLOYEE: '@T36' }[who];
    test(`T33-T36 ${who}: every one of the ${ROUTES.length} routes answers as the permission table says`, { tag }, async ({ api, anonymousApi }) => {
      const token = who === 'ANONYMOUS' ? undefined : api[who].token!;
      // Availability is checked for ownership before the input (BR-A03): a body names the caller, or an employee
      // asking for no one in particular would get 403 for the wrong reason.
      const me = token ? ((await (await call(anonymousApi.request, 'GET', '/auth/me', token)).json()) as { sub: number }).sub : 0;
      const wrong: string[] = [];
      for (const [method, path, allowed, why] of ROUTES) {
        const body = path === '/availabilities' ? { employeeId: me } : {};
        const status = (await call(anonymousApi.request, method, path, token, body)).status();
        const may = allowed === 'PUBLIC' || (who !== 'ANONYMOUS' && allowed.includes(who));
        const expected = may ? 'allowed' : who === 'ANONYMOUS' ? 401 : 403;
        const ok = may ? status !== 401 && status !== 403 && status < 500 : status === expected;
        if (!ok) wrong.push(`${method} ${path} (${why}): expected ${expected}, got ${status}`);
      }
      // One list of every wrong route, so a failure shows the whole picture at once.
      expect(wrong).toEqual([]);
    });
  }

  test('T33 a route that does not exist is 404 for everyone, a protected one 401 without a token', { tag: '@T33' }, async ({ api, anonymousApi }) => {
    // The guards run on matched routes only, so an anonymous caller can tell a real path (401) from an unknown one
    // (404). The route list is not secret here: the UI and the docs name every route.
    expect((await api.EMPLOYEE.get('/admin')).status()).toBe(404);
    expect((await anonymousApi.request.get('/admin')).status()).toBe(404);
    expect((await anonymousApi.request.get('/employees')).status()).toBe(401);
  });

  test('T37 a changed token is refused: a role edited in the payload, a removed signature, alg none, another secret (BR-A01)', { tag: '@T37' }, async ({ api, anonymousApi }) => {
    const real = api.EMPLOYEE.token!;
    const [header, payload, signature] = parts(real);
    const asAdmin = b64({ ...payloadOf(real), role: 'ADMIN' });
    const forged = {
      'role edited, old signature': `${header}.${asAdmin}.${signature}`,
      'no signature': `${header}.${payload}.`,
      'alg none': `${b64({ alg: 'none', typ: 'JWT' })}.${asAdmin}.`,
      'signed with another secret': await (async () => {
        const { createHmac } = await import('node:crypto');
        const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${asAdmin}`;
        return `${body}.${createHmac('sha256', 'not-the-secret-of-this-api-0123456789').update(body).digest('base64url')}`;
      })(),
      'not a token': 'hello',
      'expired long ago': `${header}.${b64({ ...payloadOf(real), exp: 1_000_000_000 })}.${signature}`
    };
    for (const [name, token] of Object.entries(forged)) {
      expect((await call(anonymousApi.request, 'GET', '/employees', token)).status(), name).toBe(401);
    }
    // The real token still works for what an employee may do.
    expect((await call(anonymousApi.request, 'GET', '/auth/me', real)).status()).toBe(200);
  });

  test('T37 the role comes from the account on every request: a token issued before a role change follows the new role (F-04)', { tag: '@T37' }, async ({ api, anonymousApi, factories, signInAsEmployee }) => {
    const person = await factories.employees.create({ role: 'PLANNER' });
    const token = (await signInAsEmployee(person)).token!;
    const shifts = () => call(anonymousApi.request, 'GET', '/employees', token);
    expect((await shifts()).status()).toBe(200);
    // Demoted: the old token, which still says PLANNER, loses the planner's rights at once.
    await api.ADMIN.employees.update(person.id, { role: 'EMPLOYEE' });
    expect(payloadOf(token).role).toBe('PLANNER');
    expect((await shifts()).status()).toBe(403);
    expect((await (await call(anonymousApi.request, 'GET', '/auth/me', token)).json()).role).toBe('EMPLOYEE');
    // Promoted: the same token gains the new rights at once too.
    await api.ADMIN.employees.update(person.id, { role: 'MANAGER' });
    expect((await call(anonymousApi.request, 'POST', `/schedules/${N}/approve`, token)).status()).toBe(404);
  });

  test('T37 the Authorization header must be exactly "Bearer <token>": other forms are refused (F-10, F-15)', { tag: '@T37' }, async ({ api, anonymousApi }) => {
    const token = api.ADMIN.token!;
    for (const header of [token, `Basic ${token}`, `bearer ${token}`, `Bearer  ${token}`, `Bearer ${token} extra`, 'Bearer']) {
      expect((await anonymousApi.request.get('/auth/me', { headers: { Authorization: header } })).status(), header.slice(0, 12)).toBe(401);
    }
  });
});
