import { expect, test } from '../../fixtures/test';
import { uniqueEmail } from '../../utils/unique';
import { WEEK } from '../../utils/test-week';

// Group A, employee management (docs/risk-analysis.md). The tests name the rule or finding they protect.

test.describe('A: employee management (API)', { tag: '@groupA' }, () => {
  test('T01 an admin creates an employee: stored as sent, email in lower case, active', { tag: '@T01' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const email = uniqueEmail('t01');
    const created = await api.ADMIN.employees.create({
      firstName: '  Aino ',
      lastName: 'Virtanen',
      email: email.toUpperCase(),
      role: 'PLANNER',
      departmentId: department.id,
      contractMinutesPerWeek: 1845
    });
    expect(created).toMatchObject({ firstName: 'Aino', email, role: 'PLANNER', departmentId: department.id, contractMinutesPerWeek: 1845, active: true });
    expect(await api.ADMIN.employees.get(created.id)).toMatchObject({ email, qualifications: [] });
    expect(created).not.toHaveProperty('passwordHash');
  });

  test('T01 negative: duplicate email 409, bad input 400, unknown department 404, other roles 403', { tag: '@T01' }, async ({ api, factories }) => {
    const existing = await factories.employees.create();
    const body = (overrides: object) => ({ firstName: 'A', lastName: 'B', email: uniqueEmail('t01'), ...overrides });
    // The same address in another letter case is the same email.
    expect((await api.ADMIN.post('/employees', body({ email: existing.email.toUpperCase() }))).status()).toBe(409);
    for (const bad of [{ email: 'no-at-sign' }, { firstName: '   ' }, { role: 'NURSE' }, { contractMinutesPerWeek: 10081 }, { contractMinutesPerWeek: -1 }, { departmentId: 0 }]) {
      expect((await api.ADMIN.post('/employees', body(bad))).status(), JSON.stringify(bad)).toBe(400);
    }
    expect((await api.ADMIN.post('/employees', body({ departmentId: 2147483647 }))).status()).toBe(404);
    for (const role of ['PLANNER', 'MANAGER', 'EMPLOYEE'] as const) {
      expect((await api[role].post('/employees', body({}))).status(), role).toBe(403);
    }
  });

  test('T02 an admin updates one field and the others stay', { tag: '@T02' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const employee = await factories.employees.create();
    await api.ADMIN.employees.update(employee.id, { departmentId: department.id });
    await api.ADMIN.employees.update(employee.id, { contractMinutesPerWeek: 10080, role: 'MANAGER' });
    expect(await api.ADMIN.employees.get(employee.id)).toMatchObject({
      firstName: employee.firstName,
      email: employee.email,
      departmentId: department.id,
      contractMinutesPerWeek: 10080,
      role: 'MANAGER',
      active: true
    });
    // Moving out of a department is allowed.
    expect(await api.ADMIN.employees.update(employee.id, { departmentId: null })).toMatchObject({ departmentId: null });
  });

  test('T02 negative: an empty update 400, a taken email 409, an unknown employee 404, a planner 403', { tag: '@T02' }, async ({ api, factories }) => {
    const [a, b] = [await factories.employees.create(), await factories.employees.create()];
    expect((await api.ADMIN.patch(`/employees/${a.id}`, {})).status()).toBe(400);
    expect((await api.ADMIN.patch(`/employees/${a.id}`, { email: b.email })).status()).toBe(409);
    expect((await api.ADMIN.patch('/employees/2147483647', { firstName: 'X' })).status()).toBe(404);
    expect((await api.PLANNER.patch(`/employees/${a.id}`, { firstName: 'X' })).status()).toBe(403);
    expect((await api.ADMIN.employees.get(a.id)).email).toBe(a.email);
  });

  test('T03 deactivation ends access at once and keeps the employee out of schedules', { tag: '@T03' }, async ({ api, anonymousApi, factories }) => {
    const department = await factories.departments.create();
    await factories.shifts.create({ department, date: WEEK.monday });
    const employee = await factories.employees.createEligibleEmployee({ department });
    await api.ADMIN.employees.setPassword(employee.id, 'Deactivate-Me-123');
    const login = () => anonymousApi.post('/auth/login', { email: employee.email, password: 'Deactivate-Me-123' });
    const token = (await (await login()).json()).accessToken as string;

    await api.ADMIN.employees.update(employee.id, { active: false });
    // F-04: the token issued before is refused at once, and a new login fails with the usual message.
    expect((await anonymousApi.request.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
    expect((await login()).status()).toBe(401);
    // BR-H07: an inactive employee is not scheduled, so the only shift stays short.
    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(schedule.assignments).toEqual([]);
    expect(violations.map((v) => v.ruleId)).toEqual(['BR-H06']);

    await api.ADMIN.employees.update(employee.id, { active: true });
    expect((await login()).status()).toBe(200);
  });

  test('T04 an admin assigns a qualification and the engine counts it', { tag: '@T04' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    await factories.shifts.create({ department, date: WEEK.monday, requires: [{ qualification: permit, count: 1 }] });
    const employee = await factories.employees.createEligibleEmployee({ department });
    await api.ADMIN.employees.assignQualification(employee.id, permit.id, '2031-12-31');
    expect((await api.ADMIN.employees.get(employee.id)).qualifications).toEqual([
      expect.objectContaining({ qualificationId: permit.id, code: permit.code, validUntil: expect.stringMatching(/^2031-12-31/), valid: true })
    ]);
    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
    expect(schedule.assignments!.map((a) => a.employeeId)).toEqual([employee.id]);
  });

  test('T04 assigning again only changes the expiry date (PUT)', { tag: '@T04' }, async ({ api, factories }) => {
    const permit = await factories.qualifications.create();
    const employee = await factories.employees.create();
    await api.ADMIN.employees.assignQualification(employee.id, permit.id, '2031-12-31');
    await api.ADMIN.employees.assignQualification(employee.id, permit.id, null);
    expect((await api.ADMIN.employees.get(employee.id)).qualifications).toEqual([expect.objectContaining({ qualificationId: permit.id, validUntil: null, valid: true })]);
  });

  test('T05 an admin removes a qualification and the requirement is short again', { tag: '@T05' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday, requires: [{ qualification: permit, count: 1 }] });
    const employee = await factories.employees.createEligibleEmployee({ department, qualifications: [permit] });
    expect((await api.ADMIN.delete(`/employees/${employee.id}/qualifications/${permit.id}`)).status()).toBe(204);
    expect((await api.ADMIN.employees.get(employee.id)).qualifications).toEqual([]);
    expect((await api.ADMIN.delete(`/employees/${employee.id}/qualifications/${permit.id}`)).status()).toBe(404);
    const { violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([expect.objectContaining({ ruleId: 'BR-H06', shiftId: shift.id })]);
  });

  test('T06 invalid qualification input: unknown ids 404, an impossible date 400, a planner 403', { tag: '@T06' }, async ({ api, factories }) => {
    const permit = await factories.qualifications.create();
    const employee = await factories.employees.create();
    const assign = (employeeId: number, qualificationId: number, validUntil: unknown, client = api.ADMIN) =>
      client.put(`/employees/${employeeId}/qualifications/${qualificationId}`, { validUntil });
    expect((await assign(employee.id, 2147483647, null)).status()).toBe(404);
    expect((await assign(2147483647, permit.id, null)).status()).toBe(404);
    for (const bad of ['2031-02-30', '2031-13-01', '31.12.2031', '2031-12-31T00:00:00Z', 20311231]) {
      expect((await assign(employee.id, permit.id, bad)).status(), String(bad)).toBe(400);
    }
    expect((await assign(employee.id, permit.id, null, api.PLANNER)).status()).toBe(403);
    expect((await api.ADMIN.employees.get(employee.id)).qualifications).toEqual([]);
  });

  test('T06 an expired qualification shows as not valid', { tag: '@T06' }, async ({ api, factories }) => {
    const permit = await factories.qualifications.create();
    const employee = await factories.employees.create();
    await api.ADMIN.employees.assignQualification(employee.id, permit.id, '2020-01-31');
    expect((await api.ADMIN.employees.get(employee.id)).qualifications).toEqual([expect.objectContaining({ valid: false })]);
  });

  test('T06 boundary: a qualification counts through its last local day, but not for a night that runs past it (BR-H01)', { tag: '@T06' }, async ({ factories }) => {
    // Two wards, each with one employee whose qualification is valid until Monday, and one shift on Monday.
    // A separate ward per shift keeps the rest period between a morning and a night out of the picture.
    const permit = await factories.qualifications.create();
    const requires = [{ qualification: permit, count: 1 }];
    const generate = async (type: 'MORNING' | 'NIGHT') => {
      const department = await factories.departments.create();
      await factories.shifts.create({ department, date: WEEK.monday, type, requires });
      await factories.employees.createEmployeeWithExpiredQualification({ department, qualification: permit, validUntil: WEEK.monday });
      return (await factories.schedules.createGenerated({ department, start: WEEK.monday })).violations.map((v) => v.ruleId);
    };
    // Monday 07:00 to 15:00 ends before midnight after the last valid day.
    expect(await generate('MORNING')).toEqual([]);
    // Monday 22:00 to Tuesday 07:30 runs past it, so the requirement is not met.
    expect(await generate('NIGHT')).toEqual(['BR-H06']);
  });
});
