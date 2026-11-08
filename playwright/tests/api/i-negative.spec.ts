import { expect, test } from '../../fixtures/test';
import { helsinki } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Group I, negative testing: input that must be refused, and hand edits that are stored but must never pass approval.
// Each test names the rule it protects. Cases already covered by groups A to H are not repeated here.

test.describe('I: negative testing (API)', { tag: '@groupI' }, () => {
  test('T38 a time that does not exist is refused, for shifts and for schedule periods (BR-T01)', { tag: '@T38' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const shift = { departmentId: department.id, type: 'MORNING', startsAt: helsinki(WEEK.monday, '07:00'), endsAt: helsinki(WEEK.monday, '15:00'), requiredHeadcount: 1 };
    // Each bad value is the end of a shift that starts earlier, so "ends before it starts" cannot hide it: read
    // leniently, 24:00 would be the next midnight and 29 February the first of March, both after the start.
    const early = helsinki('2031-02-27', '07:00');
    for (const [name, endsAt] of [
      ['hour 24', '2031-03-03T24:00:00+02:00'],
      ['29 February in a common year', '2031-02-29T07:00:00+02:00'],
      ['second 60', '2031-03-03T07:00:60+02:00'],
      ['31 April', '2031-04-31T07:00:00+03:00'],
      ['no offset', '2031-03-03T07:00:00'],
      ['date only', '2031-03-03'],
      ['empty', '']
    ]) {
      const response = await api.PLANNER.post('/shifts', { ...shift, startsAt: early, endsAt });
      expect(response.status(), name).toBe(400);
    }
    const period = (periodStart: string, periodEnd: string) => api.PLANNER.post('/schedules', { departmentId: department.id, periodStart, periodEnd });
    expect((await period('2031-02-29', '2031-03-05')).status()).toBe(400);
    expect((await period(WEEK.sunday, WEEK.monday)).status()).toBe(400);
    // 42 days is the longest period (the engine's run time is bounded by it), 43 is refused.
    expect((await period('2031-04-01', '2031-05-13')).status()).toBe(400);
    expect((await period('2031-04-01', '2031-05-12')).status()).toBe(201);
    expect(await api.PLANNER.shifts.list(department.id)).toEqual([]);
  });

  test('T39 PINNED F-16: two identical shifts of one ward are both stored, so the ward needs twice the people', { tag: '@T39' }, async ({ api, factories }) => {
    // Records today's behavior on purpose (open question F-16). It may be right for two teams on the same hours, or it
    // may be a request sent twice. When duplicates are refused, this test fails and changes together with the fix.
    const department = await factories.departments.create();
    const shift = { departmentId: department.id, type: 'MORNING', startsAt: helsinki(WEEK.monday, '07:00'), endsAt: helsinki(WEEK.monday, '15:00'), requiredHeadcount: 1 };
    expect((await api.PLANNER.post('/shifts', shift)).status()).toBe(201);
    expect((await api.PLANNER.post('/shifts', shift)).status()).toBe(201);
    expect(await api.PLANNER.shifts.list(department.id)).toHaveLength(2);
  });

  test('T39 overlapping shifts by hand are stored but reported for the person, and approval refuses them (BR-H03, BR-W03)', { tag: '@T39' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const morning = await factories.shifts.create({ department, date: WEEK.monday, type: 'MORNING' });
    const evening = await factories.shifts.create({ department, date: WEEK.monday, type: 'EVENING' });
    const nurse = await factories.employees.createEligibleEmployee({ department });
    const schedule = await factories.schedules.create({ department, start: WEEK.monday });
    for (const shift of [morning, evening]) await api.PLANNER.schedules.assign(schedule.id, shift.id, nurse.id);
    await api.PLANNER.schedules.generate(schedule.id);
    await api.PLANNER.schedules.step(schedule.id, 'submit');
    const refused = await api.MANAGER.post(`/schedules/${schedule.id}/approve`);
    expect(refused.status()).toBe(409);
    expect(((await refused.json()).violations as Array<{ ruleId: string }>).map((v) => v.ruleId)).toContain('BR-H03');
    // The same person twice on one shift is refused at once.
    await api.MANAGER.schedules.step(schedule.id, 'reject');
    expect((await api.PLANNER.post(`/schedules/${schedule.id}/assignments`, { shiftId: morning.id, employeeId: nurse.id })).status()).toBe(409);
  });

  test('T40 a missing employee or qualification is 404, an inactive person by hand is BR-H07, a requirement nobody holds is BR-H06', { tag: '@T40' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday });
    const rare = await factories.shifts.create({ department, date: WEEK.tuesday, requires: [{ qualification: permit, count: 1 }] });
    await factories.employees.createEligibleEmployee({ department });
    const inactive = await factories.employees.createInactiveEmployee({ department });
    const schedule = await factories.schedules.create({ department, start: WEEK.monday });
    expect((await api.PLANNER.post(`/schedules/${schedule.id}/assignments`, { shiftId: shift.id, employeeId: 2147483647 })).status()).toBe(404);
    expect((await api.PLANNER.post(`/schedules/${schedule.id}/assignments`, { shiftId: 2147483647, employeeId: inactive.id })).status()).toBe(404);
    expect((await api.PLANNER.put(`/shifts/${shift.id}/requirements/2147483647`, { count: 1 })).status()).toBe(404);
    expect((await api.ADMIN.put(`/employees/${inactive.id}/qualifications/2147483647`, { validUntil: null })).status()).toBe(404);

    await api.PLANNER.schedules.assign(schedule.id, shift.id, inactive.id);
    const { violations } = await api.PLANNER.schedules.generate(schedule.id);
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'BR-H07', shiftId: shift.id, employeeId: inactive.id }),
        expect.objectContaining({ ruleId: 'BR-H06', shiftId: rare.id, message: `Shift ${rare.id} has 0 of 1 people with qualification ${permit.id} valid for the shift` })
      ])
    );
    // The place itself is still filled with someone without the permit (open question D-01, pinned in
    // factories.spec.ts), so the shortage stays reported and blocks approval.
    expect((await api.PLANNER.schedules.get(schedule.id)).assignments!.filter((a) => a.shiftId === rare.id)).toHaveLength(1);
  });

  test('T41 an invalid or unknown department is refused everywhere it is named, and a department in use cannot be deleted', { tag: '@T41' }, async ({ api, factories }) => {
    const period = { periodStart: '2031-06-02', periodEnd: '2031-06-08' };
    for (const departmentId of [0, -1, 1.5, 'abc', null, 2147483648]) {
      expect((await api.PLANNER.post('/schedules', { departmentId, ...period })).status(), String(departmentId)).toBe(400);
    }
    expect((await api.PLANNER.post('/schedules', { departmentId: 2147483647, ...period })).status()).toBe(404);
    expect((await api.PLANNER.get('/shifts?departmentId=abc')).status()).toBe(400);
    expect((await api.PLANNER.get('/departments/abc')).status()).toBe(400);

    // A shift of another ward cannot be put into this ward's schedule.
    const [ward, other] = [await factories.departments.create(), await factories.departments.create()];
    const foreign = await factories.shifts.create({ department: other, date: WEEK.monday });
    const nurse = await factories.employees.createEligibleEmployee({ department: ward });
    const schedule = await factories.schedules.create({ department: ward, start: WEEK.monday });
    const refused = await api.PLANNER.post(`/schedules/${schedule.id}/assignments`, { shiftId: foreign.id, employeeId: nurse.id });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).message).toBe(`Shift ${foreign.id} belongs to another department than schedule ${schedule.id}`);

    // Deleting a ward that holds anything would remove it too (the schema cascades), so it is refused. A ward with
    // only a schedule shows that each count is checked on its own.
    const deleted = await api.ADMIN.delete(`/departments/${ward.id}`);
    expect(deleted.status()).toBe(409);
    expect((await deleted.json()).message).toBe(`Department ${ward.id} is in use (1 employees, 0 shifts, 1 schedules)`);
    const onlySchedule = await factories.departments.create();
    const lone = await factories.schedules.create({ department: onlySchedule, start: WEEK.monday });
    const refusedToo = await api.ADMIN.delete(`/departments/${onlySchedule.id}`);
    expect(refusedToo.status()).toBe(409);
    expect((await refusedToo.json()).message).toBe(`Department ${onlySchedule.id} is in use (0 employees, 0 shifts, 1 schedules)`);
    expect((await api.ADMIN.schedules.get(lone.id)).status).toBe('DRAFT');
    expect((await api.ADMIN.schedules.get(schedule.id)).status).toBe('DRAFT');
  });

  test('T42 fields a caller may not set are ignored: who owns an availability, a password hash, an id (BR-A03)', { tag: '@T42' }, async ({ api, anonymousApi, factories, signInAsEmployee }) => {
    const department = await factories.departments.create();
    const nurse = await factories.employees.createEligibleEmployee({ department });
    const colleague = await factories.employees.createEligibleEmployee({ department });
    const me = await signInAsEmployee(nurse);
    const mine = await me.availability.create({ employeeId: nurse.id, type: 'LEAVE', startsAt: helsinki('2031-06-02', '00:00'), endsAt: helsinki('2031-06-03', '00:00') });
    // Moving the record to a colleague would put leave in their name.
    const moved = await me.patch(`/availabilities/${mine.id}`, { employeeId: colleague.id });
    expect(moved.status()).toBe(200);
    expect((await moved.json()).employeeId).toBe(nurse.id);
    expect(await api.ADMIN.availability.list(colleague.id)).toEqual([]);

    // A password hash or an id in an employee body changes nothing: no login without a password set by the admin.
    const email = `i42-${Date.now()}@example.com`;
    const created = await api.ADMIN.post('/employees', { firstName: 'A', lastName: 'B', email, passwordHash: 'x', id: 1 });
    expect(created.status()).toBe(201);
    const body = await created.json();
    expect(body.id).not.toBe(1);
    expect(body).not.toHaveProperty('passwordHash');
    expect((await anonymousApi.post('/auth/login', { email, password: 'x' })).status()).toBe(401);
    // And an employee cannot change its own record, so it cannot raise its role.
    expect((await me.patch(`/employees/${nurse.id}`, { role: 'ADMIN' })).status()).toBe(403);
    expect((await api.ADMIN.employees.get(nurse.id)).role).toBe('EMPLOYEE');
  });

  test('T43 T44 a shift outside the planning period can be put in by hand, but it is reported and approval refuses it (BR-T03)', { tag: ['@T43', '@T44'] }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    await factories.shifts.create({ department, date: WEEK.monday });
    // Two places on the shift after the period: one is filled by hand, the engine must not fill the other.
    const after = await factories.shifts.create({ department, date: WEEK.nextMonday, headcount: 2 });
    const lastNight = await factories.shifts.create({ department, date: WEEK.sunday, type: 'NIGHT' });
    const [a, b] = [await factories.employees.createEligibleEmployee({ department }), await factories.employees.createEligibleEmployee({ department })];
    await factories.employees.createEligibleEmployee({ department });
    const schedule = await factories.schedules.create({ department, start: WEEK.monday });
    await api.PLANNER.schedules.assign(schedule.id, after.id, a.id);
    await api.PLANNER.schedules.assign(schedule.id, lastNight.id, b.id);
    const { violations } = await api.PLANNER.schedules.generate(schedule.id);
    expect(violations.filter((v) => v.ruleId === 'BR-T03').map((v) => v.shiftId).sort((x, y) => x - y)).toEqual([after.id, lastNight.id].sort((x, y) => x - y));
    const onAfter = (await api.PLANNER.schedules.get(schedule.id)).assignments!.filter((x) => x.shiftId === after.id);
    expect(onAfter.map((x) => x.employeeId)).toEqual([a.id]);
    await api.PLANNER.schedules.step(schedule.id, 'submit');
    const refused = await api.MANAGER.post(`/schedules/${schedule.id}/approve`);
    expect(refused.status()).toBe(409);
    expect(((await refused.json()).violations as Array<{ ruleId: string }>).filter((v) => v.ruleId === 'BR-T03')).toHaveLength(2);
  });
});
