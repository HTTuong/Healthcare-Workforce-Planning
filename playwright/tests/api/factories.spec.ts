import { expect, test } from '../../fixtures/test';
import { helsinki } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Each factory promises a business situation. These tests check the promise where it matters: in what the
// scheduling engine does with the data. The engine ranks equal candidates by id, so in each test the employee who
// must NOT be chosen is created first and would win the tie if the factory did not do its job.

const allDay = { from: helsinki(WEEK.monday, '06:00'), to: helsinki(WEEK.monday, '16:00') };

test.describe('factories', { tag: '@factories' }, () => {
  test('control: of two equal eligible employees, the engine takes the one created first', async ({ factories }) => {
    const department = await factories.departments.create();
    await factories.shifts.create({ department, date: WEEK.monday });
    const first = await factories.employees.createEligibleEmployee({ department });
    await factories.employees.createEligibleEmployee({ department });
    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
    expect(schedule.assignments!.map((a) => a.employeeId)).toEqual([first.id]);
  });

  test('createEligibleEmployee: holds the required qualification and is assigned', async ({ factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    await factories.shifts.create({ department, date: WEEK.monday, requires: [{ qualification: permit, count: 1 }] });
    await factories.employees.createEligibleEmployee({ department });
    const qualified = await factories.employees.createEligibleEmployee({ department, qualifications: [permit] });
    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
    expect(schedule.assignments!.map((a) => a.employeeId)).toEqual([qualified.id]);
  });

  for (const kind of ['createUnavailableEmployee', 'createEmployeeOnLeave'] as const) {
    test(`${kind}: is not assigned while unavailable (BR-H02)`, async ({ factories }) => {
      const department = await factories.departments.create();
      await factories.shifts.create({ department, date: WEEK.monday });
      const away = await factories.employees[kind]({ department, ...allDay });
      const present = await factories.employees.createEligibleEmployee({ department });
      const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
      expect(schedule.assignments!.map((a) => a.employeeId)).toEqual([present.id]);
      expect(away.id).toBeLessThan(present.id);
    });
  }

  test('createEmployeePreferring: wins a tie it would otherwise lose (BR-S01)', async ({ factories }) => {
    const department = await factories.departments.create();
    await factories.shifts.create({ department, date: WEEK.monday });
    await factories.employees.createEligibleEmployee({ department });
    const keen = await factories.employees.createEmployeePreferring({ department, ...allDay });
    const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(schedule.assignments!.map((a) => a.employeeId)).toEqual([keen.id]);
  });

  test('createEmployeeWithExpiredQualification: does not count as qualified (BR-H01)', async ({ factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday, requires: [{ qualification: permit, count: 1 }] });
    await factories.employees.createEmployeeWithExpiredQualification({ department, qualification: permit, validUntil: '2031-03-02' });
    const { violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    // The qualification expired the day before the shift, so the requirement stays unmet and the schedule cannot be
    // approved. The engine still puts the employee on the shift: see the pinned finding below.
    expect(violations).toEqual([
      expect.objectContaining({ ruleId: 'BR-H06', shiftId: shift.id, message: expect.stringContaining(`qualification ${permit.id}`) })
    ]);
  });

  // PINNED FINDING D-01 (day 30/11): the engine fills the only place of a shift that needs a qualification with an
  // employee who does not hold it. business-rules.md says BR-H01 allows an employee only on shifts whose required
  // qualifications they hold; scheduling-engine.md counts requirements inside the headcount, so pass 2 may use any
  // employee for the remaining places, even when no place is left for the qualification. The schedule still reports
  // BR-H06 and cannot be approved, so nobody unqualified works the shift, but the planner sees a misleading draft.
  // This test records today's behavior. When the rule is decided and fixed, it fails and changes with the fix.
  test('PINNED D-01: the only place of a shift that needs a qualification goes to an unqualified employee', async ({ factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    await factories.shifts.create({ department, date: WEEK.monday, requires: [{ qualification: permit, count: 1 }] });
    const unqualified = await factories.employees.createEligibleEmployee({ department });
    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(schedule.assignments!.map((a) => a.employeeId)).toEqual([unqualified.id]);
    expect(violations.map((v) => v.ruleId)).toEqual(['BR-H06']);
  });

  test('createInactiveEmployee: is never scheduled (BR-H07)', async ({ factories }) => {
    const department = await factories.departments.create();
    await factories.shifts.create({ department, date: WEEK.monday });
    await factories.employees.createInactiveEmployee({ department });
    const active = await factories.employees.createEligibleEmployee({ department });
    const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(schedule.assignments!.map((a) => a.employeeId)).toEqual([active.id]);
  });

  test('ShiftFactory: a night starts on its date and ends the next morning in Helsinki time', async ({ factories }) => {
    const department = await factories.departments.create();
    const night = await factories.shifts.create({ department, date: '2026-10-24', type: 'NIGHT', start: '22:00', end: '06:00' });
    // The night of the end of summer time: 22:00+03:00 to 06:00+02:00 is 9 real hours (BR-T02).
    expect(night.startsAt).toBe('2026-10-24T19:00:00.000Z');
    expect(night.endsAt).toBe('2026-10-25T04:00:00.000Z');
  });

  test('ScheduleFactory: reaches each workflow step the way the product does', async ({ factories, api }) => {
    const department = await factories.departments.create();
    await factories.shifts.create({ department, date: WEEK.monday });
    await factories.employees.createEligibleEmployee({ department });
    const review = await factories.schedules.createInReview({ department, start: WEEK.monday });
    expect((await api.PLANNER.schedules.get(review.schedule.id)).status).toBe('REVIEW');
    await factories.shifts.create({ department, date: WEEK.nextMonday });
    const published = await factories.schedules.createPublished({ department, start: WEEK.nextMonday });
    expect(published.schedule.assignments).toHaveLength(1);
    expect((await api.PLANNER.schedules.get(published.schedule.id)).status).toBe('PUBLISHED');
  });

  test('every factory call creates unique data, so parallel tests never collide', async ({ factories }) => {
    const [a, b] = await Promise.all([factories.departments.create(), factories.departments.create()]);
    expect(a.code).not.toBe(b.code);
    const [x, y] = await Promise.all([factories.employees.create(), factories.employees.create()]);
    expect(x.email).not.toBe(y.email);
    const [p, q] = await Promise.all([factories.qualifications.create(), factories.qualifications.create()]);
    expect(p.code).not.toBe(q.code);
  });
});
