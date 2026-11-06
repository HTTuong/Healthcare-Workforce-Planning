import { expect, test } from '../../fixtures/test';
import { addDays, helsinki } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Group B, availability (docs/risk-analysis.md). An employee declares when it would like to work (AVAILABLE), when it
// cannot (UNAVAILABLE) and leave (LEAVE). The engine never schedules into UNAVAILABLE or LEAVE time (BR-H02).
// Ranges are half open: the end is not part of the range, so 07:00 to 15:00 and 15:00 to 16:00 do not overlap.

const at = (date: string, time: string) => helsinki(date, time);
const utc = (date: string, time: string) => new Date(at(date, time)).toISOString();

test.describe('B: availability (API)', { tag: '@groupB' }, () => {
  test('T07 an employee records its own availability and the stored instants are the ones sent', { tag: '@T07' }, async ({ factories, signInAsEmployee }) => {
    const employee = await factories.employees.create();
    const me = await signInAsEmployee(employee);
    const created = await me.availability.create({ employeeId: employee.id, type: 'AVAILABLE', startsAt: at(WEEK.monday, '08:00'), endsAt: at(WEEK.monday, '16:00') });
    // Sent as 08:00+02:00 Helsinki time, stored and returned as the same instant in UTC (BR-T01).
    expect(created).toMatchObject({ employeeId: employee.id, type: 'AVAILABLE', startsAt: '2031-03-03T06:00:00.000Z', endsAt: '2031-03-03T14:00:00.000Z' });
    // An offset other than Helsinki's names the same instant and is stored as it.
    const leave = await me.availability.create({ employeeId: employee.id, type: 'LEAVE', startsAt: '2031-03-04T06:00:00Z', endsAt: '2031-03-05T06:00:00+00:00' });
    expect(leave).toMatchObject({ startsAt: utc(WEEK.tuesday, '08:00'), endsAt: utc(WEEK.wednesday, '08:00') });
    expect((await me.availability.list()).map((a) => a.id)).toEqual([created.id, leave.id]);
  });

  test('T07 negative: missing or wrong fields 400, a time without an offset 400, an unknown employee 404', { tag: '@T07' }, async ({ api, factories }) => {
    const employee = await factories.employees.create();
    const valid = { employeeId: employee.id, type: 'UNAVAILABLE', startsAt: at(WEEK.monday, '08:00'), endsAt: at(WEEK.monday, '16:00') };
    const bad: Array<[string, object]> = [
      ['no type', { type: undefined }],
      ['unknown type', { type: 'HOLIDAY' }],
      ['type in lower case', { type: 'leave' }],
      ['no start', { startsAt: undefined }],
      ['end before start', { endsAt: at(WEEK.monday, '07:59') }],
      ['empty range', { endsAt: at(WEEK.monday, '08:00') }],
      // Without an offset the instant depends on the server's zone (R-TIME-01).
      ['no offset', { startsAt: '2031-03-03T08:00:00' }],
      ['impossible date', { startsAt: '2031-02-30T08:00:00+02:00' }],
      ['a number', { startsAt: 1_900_000_000_000 }],
      ['employee id 0', { employeeId: 0 }]
    ];
    for (const [name, change] of bad) {
      expect((await api.ADMIN.post('/availabilities', { ...valid, ...change })).status(), name).toBe(400);
    }
    expect((await api.ADMIN.post('/availabilities', { ...valid, employeeId: 2147483647 })).status()).toBe(404);
    expect(await api.ADMIN.availability.list(employee.id)).toEqual([]);
  });

  test('T07 ownership: an employee writes and reads only its own, a planner reads its department (BR-A03)', { tag: '@T07' }, async ({ api, factories, signInAsEmployee }) => {
    const ward = await factories.departments.create();
    const [nurse, colleague] = [await factories.employees.create({ department: ward }), await factories.employees.create({ department: ward })];
    const outsider = await factories.employees.create();
    const planner = await signInAsEmployee(await factories.employees.create({ role: 'PLANNER', department: ward }));
    const asNurse = await signInAsEmployee(nurse);
    const range = { type: 'LEAVE', startsAt: at(WEEK.monday, '00:00'), endsAt: at(WEEK.tuesday, '00:00') };

    expect((await asNurse.post('/availabilities', { ...range, employeeId: colleague.id })).status()).toBe(403);
    const colleagueLeave = await api.ADMIN.availability.create({ ...range, employeeId: colleague.id });
    const outsiderLeave = await api.ADMIN.availability.create({ ...range, employeeId: outsider.id });
    expect((await asNurse.patch(`/availabilities/${colleagueLeave.id}`, { type: 'AVAILABLE' })).status()).toBe(403);
    expect((await asNurse.delete(`/availabilities/${colleagueLeave.id}`)).status()).toBe(403);
    expect((await asNurse.get(`/availabilities?employeeId=${colleague.id}`)).status()).toBe(403);
    expect(await asNurse.availability.list()).toEqual([]);

    // The planner sees the colleague in its own ward, and not the employee outside it.
    const seen = (await planner.availability.list()).map((a) => a.id);
    expect(seen).toContain(colleagueLeave.id);
    expect(seen).not.toContain(outsiderLeave.id);
    // A planner changes only its own records, like every role but admin.
    expect((await planner.patch(`/availabilities/${colleagueLeave.id}`, { type: 'AVAILABLE' })).status()).toBe(403);
  });

  test('T08 an unavailable employee is left out and the eligible one gets the shift (BR-H02)', { tag: '@T08' }, async ({ factories }) => {
    const department = await factories.departments.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday });
    // The unavailable employee is created first, so with equal scores the lower id would win the tie.
    await factories.employees.createUnavailableEmployee({ department, from: at(WEEK.monday, '06:00'), to: at(WEEK.monday, '16:00') });
    const eligible = await factories.employees.createEligibleEmployee({ department });
    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
    expect(schedule.assignments).toEqual([expect.objectContaining({ shiftId: shift.id, employeeId: eligible.id })]);
  });

  test('T08 a planner who assigns an unavailable employee by hand gets a BR-H02 violation', { tag: '@T08' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday });
    const unavailable = await factories.employees.createUnavailableEmployee({ department, from: at(WEEK.monday, '06:00'), to: at(WEEK.monday, '16:00') });
    const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(schedule.assignments).toEqual([]);
    await api.PLANNER.schedules.assign(schedule.id, shift.id, unavailable.id);
    const { violations } = await api.PLANNER.schedules.check(schedule.id);
    expect(violations).toEqual([expect.objectContaining({ ruleId: 'BR-H02', shiftId: shift.id, employeeId: unavailable.id })]);
  });

  test('T09 any overlap blocks the shift, however short: the last minute, or a night running into the next morning', { tag: '@T09' }, async ({ factories }) => {
    // Each case gets its own ward with one shift and one employee, so the result is that employee or nobody.
    const assigned = async (type: 'MORNING' | 'NIGHT', from: string, to: string) => {
      const department = await factories.departments.create();
      await factories.shifts.create({ department, date: WEEK.monday, type });
      await factories.employees.createUnavailableEmployee({ department, from, to });
      const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
      return schedule.assignments!.length;
    };
    // Morning 07:00 to 15:00.
    expect(await assigned('MORNING', at(WEEK.monday, '14:59'), at(WEEK.monday, '18:00'))).toBe(0);
    expect(await assigned('MORNING', at(WEEK.monday, '05:00'), at(WEEK.monday, '07:01'))).toBe(0);
    expect(await assigned('MORNING', at(WEEK.monday, '10:00'), at(WEEK.monday, '11:00'))).toBe(0);
    // Night Monday 22:00 to Tuesday 07:30: unavailable on Tuesday morning only.
    expect(await assigned('NIGHT', at(WEEK.tuesday, '07:00'), at(WEEK.tuesday, '12:00'))).toBe(0);
  });

  test('T09 boundaries: a range that ends as the shift starts, or starts as it ends, does not block it', { tag: '@T09' }, async ({ factories }) => {
    const department = await factories.departments.create();
    await factories.shifts.create({ department, date: WEEK.monday, headcount: 2 });
    // Morning 07:00 to 15:00, needing two: one employee is away until 07:00, the other from 15:00.
    const before = await factories.employees.createUnavailableEmployee({ department, from: at(WEEK.monday, '00:00'), to: at(WEEK.monday, '07:00') });
    const after = await factories.employees.createUnavailableEmployee({ department, from: at(WEEK.monday, '15:00'), to: at(WEEK.monday, '23:00') });
    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
    expect(schedule.assignments!.map((a) => a.employeeId).sort((x, y) => x - y)).toEqual([before.id, after.id]);
  });

  test('T09 a preference that covers only part of a shift does not count as preferred (BR-S01)', { tag: '@T09' }, async ({ factories }) => {
    const department = await factories.departments.create();
    await factories.shifts.create({ department, date: WEEK.monday });
    // Created first, so it wins a tie: only a full preference of the other employee can beat it.
    const partial = await factories.employees.createEmployeePreferring({ department, from: at(WEEK.monday, '08:00'), to: at(WEEK.monday, '15:00') });
    const full = await factories.employees.createEmployeePreferring({ department, from: at(WEEK.monday, '07:00'), to: at(WEEK.monday, '15:00') });
    const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(schedule.assignments!.map((a) => a.employeeId)).toEqual([full.id]);
    expect(schedule.assignments!.map((a) => a.employeeId)).not.toContain(partial.id);
  });

  test('T10 leave covers whole days: no shift during it, shifts after it are fine', { tag: '@T10' }, async ({ factories }) => {
    const department = await factories.departments.create();
    const monday = await factories.shifts.create({ department, date: WEEK.monday });
    const tuesdayNight = await factories.shifts.create({ department, date: WEEK.tuesday, type: 'NIGHT' });
    const wednesday = await factories.shifts.create({ department, date: WEEK.wednesday });
    // Leave on Monday and Tuesday: from 00:00 Monday to 00:00 Wednesday, as the UI sends whole days.
    const onLeave = await factories.employees.createEmployeeOnLeave({ department, from: at(WEEK.monday, '00:00'), to: at(WEEK.wednesday, '00:00') });
    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    // Monday and the Tuesday night (it starts inside the leave) stay short, Wednesday is worked.
    expect(violations.map((v) => [v.ruleId, v.shiftId])).toEqual([
      ['BR-H06', monday.id],
      ['BR-H06', tuesdayNight.id]
    ]);
    expect(schedule.assignments).toEqual([expect.objectContaining({ shiftId: wednesday.id, employeeId: onLeave.id })]);
  });

  test('T10 a schedule with an employee on leave cannot be approved', { tag: '@T10' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday });
    const employee = await factories.employees.createEligibleEmployee({ department });
    const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(schedule.assignments!.map((a) => a.employeeId)).toEqual([employee.id]);
    // Leave entered after the schedule was made: the stored assignment now breaks BR-H02.
    await api.ADMIN.availability.create({ employeeId: employee.id, type: 'LEAVE', startsAt: at(WEEK.monday, '00:00'), endsAt: at(addDays(WEEK.monday, 7), '00:00') });
    expect((await api.PLANNER.schedules.check(schedule.id)).violations).toEqual([expect.objectContaining({ ruleId: 'BR-H02', shiftId: shift.id, employeeId: employee.id })]);
    await api.PLANNER.schedules.step(schedule.id, 'submit');
    const approve = await api.MANAGER.post(`/schedules/${schedule.id}/approve`);
    expect(approve.status()).toBe(409);
    expect((await api.MANAGER.schedules.get(schedule.id)).status).toBe('REVIEW');
  });

  test('T11 overlapping ranges of one employee are refused with 409, whatever their type', { tag: '@T11' }, async ({ api, factories }) => {
    const employee = await factories.employees.create();
    const other = await factories.employees.create();
    const add = (type: string, from: string, to: string, employeeId = employee.id) =>
      api.ADMIN.post('/availabilities', { employeeId, type, startsAt: at(WEEK.monday, from), endsAt: at(WEEK.monday, to) });
    expect((await add('AVAILABLE', '08:00', '16:00')).status()).toBe(201);
    for (const [type, from, to] of [
      ['AVAILABLE', '08:00', '16:00'],
      ['LEAVE', '12:00', '20:00'],
      ['UNAVAILABLE', '06:00', '08:01'],
      ['UNAVAILABLE', '15:59', '17:00'],
      ['UNAVAILABLE', '10:00', '11:00'],
      ['UNAVAILABLE', '00:00', '23:59']
    ]) {
      const response = await add(type, from, to);
      expect(response.status(), `${type} ${from}-${to}`).toBe(409);
      expect((await response.json()).message).toMatch(/^Overlaps availability \d+/);
    }
    // Touching ranges, and the same time for another employee, are fine.
    expect((await add('UNAVAILABLE', '16:00', '20:00')).status()).toBe(201);
    expect((await add('UNAVAILABLE', '06:00', '08:00')).status()).toBe(201);
    expect((await add('LEAVE', '08:00', '16:00', other.id)).status()).toBe(201);
    expect(await api.ADMIN.availability.list(employee.id)).toHaveLength(3);
  });

  test('T11 a change that would overlap is refused and the record keeps its old values', { tag: '@T11' }, async ({ api, factories }) => {
    const employee = await factories.employees.create();
    const create = (from: string, to: string) =>
      api.ADMIN.availability.create({ employeeId: employee.id, type: 'UNAVAILABLE', startsAt: at(WEEK.monday, from), endsAt: at(WEEK.monday, to) });
    const morning = await create('08:00', '12:00');
    const afternoon = await create('13:00', '17:00');
    expect((await api.ADMIN.patch(`/availabilities/${afternoon.id}`, { startsAt: at(WEEK.monday, '11:00') })).status()).toBe(409);
    // A record does not overlap itself: moving it inside its own range is fine.
    const moved = await api.ADMIN.patch(`/availabilities/${afternoon.id}`, { startsAt: at(WEEK.monday, '12:00'), endsAt: at(WEEK.monday, '16:00') });
    expect(moved.status()).toBe(200);
    expect((await api.ADMIN.patch(`/availabilities/${morning.id}`, { endsAt: at(WEEK.monday, '07:00') })).status()).toBe(400);
    expect(await api.ADMIN.availability.list(employee.id)).toEqual([
      expect.objectContaining({ id: morning.id, startsAt: utc(WEEK.monday, '08:00'), endsAt: utc(WEEK.monday, '12:00') }),
      expect.objectContaining({ id: afternoon.id, startsAt: utc(WEEK.monday, '12:00'), endsAt: utc(WEEK.monday, '16:00') })
    ]);
  });
});
