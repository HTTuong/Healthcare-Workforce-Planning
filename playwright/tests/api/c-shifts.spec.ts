import { expect, test } from '../../fixtures/test';
import { helsinki } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Group C, shift management (docs/risk-analysis.md). Planners and admins manage shifts; a shift asks for a number of
// people (BR-H06) and for qualifications among them. A shift that a schedule in REVIEW, APPROVED or PUBLISHED shows is
// locked, so the schedule cannot change after review (R-WF-02, BR-W01).

const at = (date: string, time: string) => helsinki(date, time);
const iso = (date: string, time: string) => new Date(at(date, time)).toISOString();

test.describe('C: shift management (API)', { tag: '@groupC' }, () => {
  test('T12 a planner creates a night shift with a requirement, stored in real elapsed time across the clock change', { tag: '@T12' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    // Helsinki moves from +03:00 to +02:00 at 04:00 on Sunday 26 October 2031, so this night lasts 9 hours (BR-T02).
    const created = await api.PLANNER.shifts.create({
      departmentId: department.id,
      type: 'NIGHT',
      startsAt: at('2031-10-25', '22:00'),
      endsAt: at('2031-10-26', '06:00'),
      requiredHeadcount: 2,
      requirements: [{ qualificationId: permit.id, count: 1 }]
    });
    expect(created).toMatchObject({ startsAt: '2031-10-25T19:00:00.000Z', endsAt: '2031-10-26T04:00:00.000Z', requiredHeadcount: 2 });
    expect((Date.parse(created.endsAt) - Date.parse(created.startsAt)) / 3_600_000).toBe(9);
    expect((await api.MANAGER.shifts.get(created.id)).requirements).toEqual([
      expect.objectContaining({ qualificationId: permit.id, count: 1, qualification: expect.objectContaining({ code: permit.code }) })
    ]);
    expect((await api.ADMIN.shifts.list(department.id)).map((s) => s.id)).toEqual([created.id]);
  });

  test('T12 negative: bad input 400, unknown department or qualification 404, a manager or employee 403', { tag: '@T12' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    const valid = { departmentId: department.id, type: 'MORNING', startsAt: at(WEEK.monday, '07:00'), endsAt: at(WEEK.monday, '15:00'), requiredHeadcount: 2 };
    const bad: Array<[string, object]> = [
      ['unknown type', { type: 'DAY' }],
      ['no offset', { startsAt: '2031-03-03T07:00:00' }],
      ['end before start', { endsAt: at(WEEK.monday, '06:00') }],
      ['empty shift', { endsAt: at(WEEK.monday, '07:00') }],
      ['no people', { requiredHeadcount: 0 }],
      ['half a person', { requiredHeadcount: 1.5 }],
      ['requirements not a list', { requirements: { qualificationId: permit.id } }],
      ['more holders than people', { requirements: [{ qualificationId: permit.id, count: 3 }] }],
      ['one qualification twice', { requirements: [{ qualificationId: permit.id }, { qualificationId: permit.id }] }]
    ];
    for (const [name, change] of bad) {
      expect((await api.PLANNER.post('/shifts', { ...valid, ...change })).status(), name).toBe(400);
    }
    expect((await api.PLANNER.post('/shifts', { ...valid, departmentId: 2147483647 })).status()).toBe(404);
    expect((await api.PLANNER.post('/shifts', { ...valid, requirements: [{ qualificationId: 2147483647 }] })).status()).toBe(404);
    expect((await api.MANAGER.post('/shifts', valid)).status()).toBe(403);
    expect((await api.EMPLOYEE.post('/shifts', valid)).status()).toBe(403);
    expect((await api.EMPLOYEE.get(`/shifts?departmentId=${department.id}`)).status()).toBe(403);
    expect(await api.ADMIN.shifts.list(department.id)).toEqual([]);
  });

  test('T13 an update changes only the fields sent, and the department stays', { tag: '@T13' }, async ({ api, factories }) => {
    const [department, other] = [await factories.departments.create(), await factories.departments.create()];
    const shift = await factories.shifts.create({ department, date: WEEK.monday, type: 'EVENING' });
    const updated = await api.PLANNER.shifts.update(shift.id, { requiredHeadcount: 3, departmentId: other.id });
    expect(updated).toMatchObject({ type: 'EVENING', startsAt: shift.startsAt, endsAt: shift.endsAt, requiredHeadcount: 3, departmentId: department.id });
    const moved = await api.PLANNER.shifts.update(shift.id, { endsAt: at(WEEK.monday, '23:00') });
    expect(moved).toMatchObject({ startsAt: shift.startsAt, endsAt: iso(WEEK.monday, '23:00'), requiredHeadcount: 3 });
  });

  test('T13 negative: a headcount below a requirement 400, an end before the start 400, unknown 404, a manager 403', { tag: '@T13' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday, headcount: 2, requires: [{ qualification: permit, count: 2 }] });
    expect((await api.PLANNER.patch(`/shifts/${shift.id}`, { requiredHeadcount: 1 })).status()).toBe(400);
    expect((await api.PLANNER.patch(`/shifts/${shift.id}`, { endsAt: at(WEEK.monday, '06:59') })).status()).toBe(400);
    expect((await api.PLANNER.patch(`/shifts/${shift.id}`, { type: 'DAY' })).status()).toBe(400);
    expect((await api.PLANNER.patch('/shifts/2147483647', { requiredHeadcount: 1 })).status()).toBe(404);
    expect((await api.MANAGER.patch(`/shifts/${shift.id}`, { requiredHeadcount: 3 })).status()).toBe(403);
    expect(await api.PLANNER.shifts.get(shift.id)).toMatchObject({ requiredHeadcount: 2, endsAt: shift.endsAt, type: 'MORNING' });
  });

  test('T13 a shift is locked while its schedule is in review and opens again when the manager sends it back (R-WF-02)', { tag: '@T13' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday });
    await factories.employees.createEligibleEmployee({ department });
    const { schedule } = await factories.schedules.createInReview({ department, start: WEEK.monday });
    const refused = await api.PLANNER.patch(`/shifts/${shift.id}`, { requiredHeadcount: 2 });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).message).toBe(
      `Shift ${shift.id} is part of schedule ${schedule.id}, which is REVIEW. Only DRAFT and OPTIMIZED schedules can change (BR-W01)`
    );
    // Moving the shift out of the period is a change of the schedule too.
    expect((await api.PLANNER.patch(`/shifts/${shift.id}`, { startsAt: at(WEEK.nextMonday, '07:00'), endsAt: at(WEEK.nextMonday, '15:00') })).status()).toBe(409);
    await api.MANAGER.schedules.step(schedule.id, 'reject');
    expect(await api.PLANNER.shifts.update(shift.id, { requiredHeadcount: 2 })).toMatchObject({ requiredHeadcount: 2 });
  });

  test('T14 a planner deletes a shift: 204, then 404, and it leaves the list', { tag: '@T14' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const [keep, remove] = [await factories.shifts.create({ department, date: WEEK.monday }), await factories.shifts.create({ department, date: WEEK.tuesday })];
    expect((await api.MANAGER.delete(`/shifts/${remove.id}`)).status()).toBe(403);
    expect((await api.PLANNER.delete(`/shifts/${remove.id}`)).status()).toBe(204);
    expect((await api.PLANNER.get(`/shifts/${remove.id}`)).status()).toBe(404);
    expect((await api.PLANNER.delete(`/shifts/${remove.id}`)).status()).toBe(404);
    expect((await api.PLANNER.shifts.list(department.id)).map((s) => s.id)).toEqual([keep.id]);
  });

  test('T14 deleting a shift of a draft takes its assignment with it, the draft can be generated again', { tag: '@T14' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const [monday, tuesday] = [await factories.shifts.create({ department, date: WEEK.monday }), await factories.shifts.create({ department, date: WEEK.tuesday })];
    await factories.employees.createEligibleEmployee({ department });
    const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(schedule.assignments!.map((a) => a.shiftId)).toEqual([monday.id, tuesday.id]);
    expect((await api.PLANNER.delete(`/shifts/${tuesday.id}`)).status()).toBe(204);
    expect((await api.PLANNER.schedules.get(schedule.id)).assignments!.map((a) => a.shiftId)).toEqual([monday.id]);
    expect((await api.PLANNER.schedules.check(schedule.id)).violations).toEqual([]);
  });

  test('T14 a published schedule keeps its shifts: no change, no delete, no new shift in its period (R-WF-02)', { tag: '@T14' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday });
    const employee = await factories.employees.createEligibleEmployee({ department });
    const { schedule } = await factories.schedules.createPublished({ department, start: WEEK.monday });
    expect((await api.PLANNER.delete(`/shifts/${shift.id}`)).status()).toBe(409);
    expect((await api.ADMIN.patch(`/shifts/${shift.id}`, { requiredHeadcount: 2 })).status()).toBe(409);
    const add = (date: string, type: 'MORNING' | 'NIGHT', start: string, end: string, endDate = date) =>
      api.PLANNER.post('/shifts', { departmentId: department.id, type, startsAt: at(date, start), endsAt: at(endDate, end), requiredHeadcount: 1 });
    expect((await add(WEEK.wednesday, 'MORNING', '07:00', '15:00')).status()).toBe(409);
    // A night that starts on the last day and ends after the period is outside it (BR-T03), so it can be added.
    expect((await add(WEEK.sunday, 'NIGHT', '22:00', '07:30', WEEK.nextMonday)).status()).toBe(201);
    expect((await add(WEEK.nextMonday, 'MORNING', '07:00', '15:00')).status()).toBe(201);
    const published = await api.PLANNER.schedules.get(schedule.id);
    expect(published).toMatchObject({ status: 'PUBLISHED', assignments: [expect.objectContaining({ shiftId: shift.id, employeeId: employee.id })] });
    expect(await api.PLANNER.shifts.get(shift.id)).toMatchObject({ requiredHeadcount: 1, startsAt: shift.startsAt });
  });

  test('T15 a required qualification is set, changed and removed, within the headcount', { tag: '@T15' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday, headcount: 2 });
    const requirement = (count?: number, qualificationId = permit.id) =>
      api.PLANNER.put(`/shifts/${shift.id}/requirements/${qualificationId}`, count === undefined ? {} : { count });
    expect((await requirement()).status()).toBe(200);
    expect((await requirement(2)).status()).toBe(200);
    expect((await api.PLANNER.shifts.get(shift.id)).requirements).toEqual([expect.objectContaining({ qualificationId: permit.id, count: 2 })]);
    expect((await requirement(3)).status()).toBe(400);
    expect((await requirement(0)).status()).toBe(400);
    expect((await requirement(1, 2147483647)).status()).toBe(404);
    expect((await api.MANAGER.put(`/shifts/${shift.id}/requirements/${permit.id}`, { count: 1 })).status()).toBe(403);
    expect((await api.PLANNER.delete(`/shifts/${shift.id}/requirements/${permit.id}`)).status()).toBe(204);
    expect((await api.PLANNER.delete(`/shifts/${shift.id}/requirements/${permit.id}`)).status()).toBe(404);
    expect((await api.PLANNER.shifts.get(shift.id)).requirements).toEqual([]);
  });

  test('T15 the engine fills a required qualification first, and reports it when too few hold it (BR-H06)', { tag: '@T15' }, async ({ factories }) => {
    const permit = await factories.qualifications.create();
    const generate = async (count: number) => {
      const department = await factories.departments.create();
      const shift = await factories.shifts.create({ department, date: WEEK.monday, headcount: 2, requires: [{ qualification: permit, count }] });
      // Created first, so it would win every tie: only the requirement puts the holder in.
      const others = [await factories.employees.createEligibleEmployee({ department }), await factories.employees.createEligibleEmployee({ department })];
      const holder = await factories.employees.createEligibleEmployee({ department, qualifications: [permit] });
      const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
      return { shift, others, holder, assigned: schedule.assignments!.map((a) => a.employeeId), violations };
    };
    const one = await generate(1);
    expect(one.assigned).toContain(one.holder.id);
    expect(one.assigned).toHaveLength(2);
    expect(one.violations).toEqual([]);
    const two = await generate(2);
    expect(two.assigned).toContain(two.holder.id);
    expect(two.violations).toEqual([expect.objectContaining({ ruleId: 'BR-H06', shiftId: two.shift.id })]);
  });

  test('T16 the engine fills the headcount, never more, and reports a shortage (BR-H06)', { tag: '@T16' }, async ({ factories }) => {
    const generate = async (headcount: number, people: number) => {
      const department = await factories.departments.create();
      const shift = await factories.shifts.create({ department, date: WEEK.monday, headcount });
      for (let i = 0; i < people; i++) await factories.employees.createEligibleEmployee({ department });
      const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
      return { shift, assigned: schedule.assignments!.length, violations };
    };
    expect(await generate(2, 3)).toMatchObject({ assigned: 2, violations: [] });
    const short = await generate(3, 2);
    expect(short.assigned).toBe(2);
    expect(short.violations).toEqual([expect.objectContaining({ ruleId: 'BR-H06', shiftId: short.shift.id, message: `Shift ${short.shift.id} has 2 of 3 required people` })]);
  });

  test('T16 a headcount raised after generation is filled when the schedule is generated again (F-12)', { tag: '@T16' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday });
    for (let i = 0; i < 2; i++) await factories.employees.createEligibleEmployee({ department });
    const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(schedule.assignments).toHaveLength(1);
    await api.PLANNER.shifts.update(shift.id, { requiredHeadcount: 2 });
    // F-12: the change sends the OPTIMIZED schedule back to DRAFT, as a hand edit does, so it can be generated again.
    expect(await api.PLANNER.schedules.get(schedule.id)).toMatchObject({ status: 'DRAFT' });
    expect((await api.PLANNER.schedules.check(schedule.id)).violations.map((v) => v.ruleId)).toEqual(['BR-H06']);
    // Generating keeps the assignment made before and adds the second person.
    const again = await api.PLANNER.schedules.generate(schedule.id);
    expect(again).toMatchObject({ added: 1, violations: [] });
  });
});
