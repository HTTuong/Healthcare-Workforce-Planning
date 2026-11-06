import type { Department, Employee, Shift, ShiftType } from '../../api/types';
import { expect, test } from '../../fixtures/test';
import type { Factories } from '../../factories';
import { addDays, helsinki } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Group D (1), the scheduling core: the engine assigns eligible people and never the unavailable or the unqualified.
// The tests check the engine's result against the test's own knowledge of the data, not against the engine's own
// violation list, so a wrong assignment is caught even when the validation misses it too.

const DAYS = Array.from({ length: 7 }, (_, i) => addDays(WEEK.monday, i));
const at = (date: string, time: string) => helsinki(date, time);

/** Every shift of every day of the test week, one person each, in the given ward. */
async function fullWeek(factories: Factories, department: Department, types: ShiftType[] = ['MORNING', 'EVENING', 'NIGHT']) {
  const shifts: Shift[] = [];
  for (const date of DAYS) for (const type of types) shifts.push(await factories.shifts.create({ department, date, type }));
  return shifts;
}

async function nurses(factories: Factories, department: Department, count: number) {
  const list: Employee[] = [];
  for (let i = 0; i < count; i++) list.push(await factories.employees.createEligibleEmployee({ department }));
  return list;
}

const overlaps = (shift: Shift, from: string, to: string) => Date.parse(shift.startsAt) < Date.parse(to) && Date.parse(from) < Date.parse(shift.endsAt);

test.describe('D: scheduling core, eligibility (API)', { tag: '@groupD' }, () => {
  test('T17 a full week is filled with eligible people only, and nothing is broken', { tag: '@T17' }, async ({ factories }) => {
    const department = await factories.departments.create();
    const shifts = await fullWeek(factories, department);
    const team = await nurses(factories, department, 8);
    // People the engine must never pick: inactive, or in another ward.
    const inactive = await factories.employees.createInactiveEmployee({ department });
    const elsewhere = await factories.employees.createEligibleEmployee({ department: await factories.departments.create() });

    const { schedule, violations, added } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
    expect(schedule).toMatchObject({ status: 'OPTIMIZED', qualityScore: expect.any(Number) });
    const assignments = schedule.assignments!;
    // The Sunday night ends on the Monday after the period, so it belongs to no period (BR-T03, a known gap in
    // architecture.md). The other 20 shifts get exactly one person each.
    const sundayNight = shifts.at(-1)!;
    const inPeriod = shifts.slice(0, -1);
    expect(added).toBe(20);
    expect(inPeriod.map((s) => assignments.filter((a) => a.shiftId === s.id).length)).toEqual(inPeriod.map(() => 1));
    expect(assignments.filter((a) => a.shiftId === sundayNight.id)).toEqual([]);
    const teamIds = new Set(team.map((e) => e.id));
    expect(assignments.every((a) => teamIds.has(a.employeeId))).toBe(true);
    expect(assignments.map((a) => a.employeeId)).not.toContain(inactive.id);
    expect(assignments.map((a) => a.employeeId)).not.toContain(elsewhere.id);
  });

  test('T17 the same data gives the same schedule: two identical wards are planned alike', { tag: '@T17' }, async ({ factories }) => {
    const plan = async () => {
      const department = await factories.departments.create();
      const shifts = await fullWeek(factories, department, ['MORNING', 'NIGHT']);
      const team = await nurses(factories, department, 5);
      const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
      // Who works which shift, by position in the ward's lists, so the two wards can be compared.
      return schedule.assignments!.map((a) => [shifts.findIndex((s) => s.id === a.shiftId), team.findIndex((e) => e.id === a.employeeId)]).sort((x, y) => x[0] - y[0]);
    };
    const first = await plan();
    // 7 mornings and 6 nights: the Sunday night is outside the period (BR-T03).
    expect(first).toHaveLength(13);
    expect(await plan()).toEqual(first);
  });

  test('T17 a person put on a shift by hand stays there, and the engine fills around it', { tag: '@T17' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const shifts = await fullWeek(factories, department, ['MORNING']);
    const team = await nurses(factories, department, 3);
    const chosen = team[2]!;
    const schedule = await factories.schedules.create({ department, start: WEEK.monday });
    const manual = await api.PLANNER.schedules.assign(schedule.id, shifts[0]!.id, chosen.id);
    const result = await api.PLANNER.schedules.generate(schedule.id);
    expect(result).toMatchObject({ added: 6, violations: [] });
    expect(result.schedule.assignments).toContainEqual(expect.objectContaining({ id: manual.id, shiftId: shifts[0]!.id, employeeId: chosen.id }));
    expect(result.schedule.assignments!.filter((a) => a.shiftId === shifts[0]!.id)).toHaveLength(1);
  });

  test('T18 time an employee marked itself as unavailable or on leave is kept free, the other days are worked', { tag: '@T18' }, async ({ factories, signInAsEmployee }) => {
    const department = await factories.departments.create();
    const shifts = await fullWeek(factories, department, ['MORNING', 'EVENING']);
    const team = await nurses(factories, department, 4);
    const nurse = team[0]!;
    // Recorded by the nurse herself, as in the product: Tuesday afternoon, and leave on Thursday and Friday.
    const me = await signInAsEmployee(nurse);
    const away = [
      { type: 'UNAVAILABLE', startsAt: at(DAYS[1]!, '12:00'), endsAt: at(DAYS[1]!, '20:00') },
      { type: 'LEAVE', startsAt: at(DAYS[3]!, '00:00'), endsAt: at(DAYS[5]!, '00:00') }
    ];
    for (const range of away) await me.availability.create({ employeeId: nurse.id, ...range });

    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
    const hers = schedule.assignments!.filter((a) => a.employeeId === nurse.id).map((a) => shifts.find((s) => s.id === a.shiftId)!);
    for (const range of away) {
      expect(hers.filter((s) => overlaps(s, range.startsAt, range.endsAt)), `${range.type} ${range.startsAt}`).toEqual([]);
    }
    // She is still scheduled on the days she is free.
    expect(hers.length).toBeGreaterThan(0);
  });

  test('T18 a hand-made assignment into leave blocks approval until it is removed (BR-H02, BR-W03)', { tag: '@T18' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday });
    await factories.employees.createEligibleEmployee({ department });
    const onLeave = await factories.employees.createEmployeeOnLeave({ department, from: at(WEEK.monday, '00:00'), to: at(WEEK.tuesday, '00:00') });
    const schedule = await factories.schedules.create({ department, start: WEEK.monday });
    const manual = await api.PLANNER.schedules.assign(schedule.id, shift.id, onLeave.id);
    await api.PLANNER.schedules.generate(schedule.id);
    await api.PLANNER.schedules.step(schedule.id, 'submit');

    const refused = await api.MANAGER.post(`/schedules/${schedule.id}/approve`);
    expect(refused.status()).toBe(409);
    expect((await refused.json()).violations).toEqual([expect.objectContaining({ ruleId: 'BR-H02', shiftId: shift.id, employeeId: onLeave.id })]);

    // The planner gets it back, removes the person and generates again: an eligible nurse takes the place.
    await api.MANAGER.schedules.step(schedule.id, 'reject');
    expect((await api.PLANNER.delete(`/schedules/${schedule.id}/assignments/${manual.id}`)).status()).toBe(204);
    expect(await api.PLANNER.schedules.generate(schedule.id)).toMatchObject({ added: 1, violations: [] });
    await api.PLANNER.schedules.step(schedule.id, 'submit');
    expect(await api.MANAGER.schedules.step(schedule.id, 'approve')).toMatchObject({ status: 'APPROVED' });
  });

  test('T19 a qualification that ends mid-week is used until its last day, then a holder without expiry takes over (BR-H01)', { tag: '@T19' }, async ({ factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    const requires = [{ qualification: permit, count: 1 }];
    const weekdays = DAYS.slice(0, 5);
    const shifts: Shift[] = [];
    for (const date of weekdays) shifts.push(await factories.shifts.create({ department, date, requires }));
    // Nobody without the permit can take these shifts, however many there are.
    await nurses(factories, department, 2);
    const expiring = await factories.employees.createEmployeeWithExpiredQualification({ department, qualification: permit, validUntil: DAYS[2]! });
    // The lasting holder is away on Monday and Tuesday, so the expiring one must work those days.
    const lasting = await factories.employees.createEmployeeOnLeave({ department, qualifications: [permit], from: at(DAYS[0]!, '00:00'), to: at(DAYS[2]!, '00:00') });

    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
    const who = (i: number) => schedule.assignments!.filter((a) => a.shiftId === shifts[i]!.id).map((a) => a.employeeId);
    expect([who(0), who(1)]).toEqual([[expiring.id], [expiring.id]]);
    expect([who(3), who(4)]).toEqual([[lasting.id], [lasting.id]]);
    expect([[expiring.id], [lasting.id]]).toContainEqual(who(2));
  });

  test('T19 an unqualified person put on a shift by hand leaves the requirement short, and approval refuses it (BR-H01, BR-H06)', { tag: '@T19' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday, requires: [{ qualification: permit, count: 1 }] });
    const unqualified = await factories.employees.createEligibleEmployee({ department });
    const schedule = await factories.schedules.create({ department, start: WEEK.monday });
    await api.PLANNER.schedules.assign(schedule.id, shift.id, unqualified.id);
    // An assignment does not record which requirement it fills, so the validation reports the requirement as short
    // (BR-H06) rather than the person (BR-H01), as validateSchedule documents.
    const { violations } = await api.PLANNER.schedules.generate(schedule.id);
    expect(violations).toEqual([
      { ruleId: 'BR-H06', shiftId: shift.id, message: `Shift ${shift.id} has 0 of 1 people with qualification ${permit.id} valid for the shift` }
    ]);
    expect((await api.PLANNER.schedules.check(schedule.id)).violations).toEqual(violations);
    await api.PLANNER.schedules.step(schedule.id, 'submit');
    expect((await api.MANAGER.post(`/schedules/${schedule.id}/approve`)).status()).toBe(409);
  });

  test('T19 a qualification that lapses after generation is caught at approval, with the data of that moment (BR-W03)', { tag: '@T19' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday, requires: [{ qualification: permit, count: 1 }] });
    const holder = await factories.employees.createEligibleEmployee({ department, qualifications: [permit] });
    const { schedule, violations } = await factories.schedules.createInReview({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
    // The admin records that the permit ended before the shift.
    await api.ADMIN.employees.assignQualification(holder.id, permit.id, addDays(WEEK.monday, -1));
    const refused = await api.MANAGER.post(`/schedules/${schedule.id}/approve`);
    expect(refused.status()).toBe(409);
    expect((await refused.json()).violations).toEqual([
      expect.objectContaining({ ruleId: 'BR-H06', shiftId: shift.id, message: `Shift ${shift.id} has 0 of 1 people with qualification ${permit.id} valid for the shift` })
    ]);
    expect((await api.MANAGER.schedules.get(schedule.id)).status).toBe('REVIEW');
  });
});
