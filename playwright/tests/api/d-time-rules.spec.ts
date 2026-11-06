import type { Department, Employee, Shift } from '../../api/types';
import { expect, test } from '../../fixtures/test';
import type { Factories } from '../../factories';
import { timeRuleBreaks, weekMinutes, workByEmployee, type Interval } from '../../utils/hard-rules';
import { addDays, helsinki } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Group D (2), the scheduling core and time: overlap (BR-H03), weekly hours (BR-H04), rest (BR-H05) and staffing
// (BR-H06). Results are judged with utils/hard-rules.ts, an independent reading of the rules, and the boundaries
// "exactly 40 h" and "exactly 11 h" are tested on both sides.

const at = (date: string, time: string) => helsinki(date, time);
const DAYS = Array.from({ length: 7 }, (_, i) => addDays(WEEK.monday, i));

async function team(factories: Factories, department: Department, count: number) {
  const list: Employee[] = [];
  for (let i = 0; i < count; i++) list.push(await factories.employees.createEligibleEmployee({ department }));
  return list;
}

/** One nurse, the given shifts, a generated week: which shifts did she get? */
async function soloNurse(factories: Factories, make: (department: Department) => Promise<Shift[]>, start: string = WEEK.monday) {
  const department = await factories.departments.create();
  const shifts = await make(department);
  const [nurse] = await team(factories, department, 1);
  const { schedule, violations } = await factories.schedules.createGenerated({ department, start });
  const taken = shifts.map((s) => schedule.assignments!.some((a) => a.shiftId === s.id && a.employeeId === nurse!.id));
  return { shifts, taken, violations, schedule };
}

test.describe('D: scheduling core, time rules (API)', { tag: '@groupD' }, () => {
  test('the independent checker itself finds overlap, short rest and a long week, and accepts the exact limits', async () => {
    const work = (...intervals: Interval[]) => new Map([[1, intervals]]);
    const i = (date: string, from: string, to: string, toDate = date): Interval => ({ startsAt: at(date, from), endsAt: at(toDate, to) });
    expect(timeRuleBreaks(work(i(WEEK.monday, '07:00', '15:00'), i(WEEK.monday, '14:30', '22:30'))).map((b) => b.rule)).toEqual(['BR-H03']);
    expect(timeRuleBreaks(work(i(WEEK.monday, '07:00', '20:00'), i(WEEK.tuesday, '07:00', '15:00')))).toEqual([]);
    expect(timeRuleBreaks(work(i(WEEK.monday, '07:00', '20:01'), i(WEEK.tuesday, '07:00', '15:00'))).map((b) => b.rule)).toEqual(['BR-H05']);
    const fourTens = DAYS.slice(0, 4).map((d) => i(d, '07:00', '17:00'));
    expect(timeRuleBreaks(work(...fourTens))).toEqual([]);
    expect(timeRuleBreaks(work(...fourTens, i(DAYS[5]!, '07:00', '07:01'))).map((b) => b.rule)).toEqual(['BR-H04']);
    // A Sunday night counts 2 hours in its own week and 7.5 in the next.
    const night = work(i(WEEK.sunday, '22:00', '07:30', WEEK.nextMonday));
    expect(weekMinutes(night, WEEK.monday).get(1)).toBe(120);
    expect(weekMinutes(night, WEEK.nextMonday).get(1)).toBe(450);
  });

  test('T20 one person never works two overlapping shifts: morning and evening of the same day go to two people (BR-H03)', { tag: '@T20' }, async ({ factories }) => {
    // Morning 07:00 to 15:00 and evening 14:30 to 22:30 overlap by 30 minutes.
    const alone = await soloNurse(factories, (department) =>
      Promise.all([factories.shifts.create({ department, date: WEEK.monday, type: 'MORNING' }), factories.shifts.create({ department, date: WEEK.monday, type: 'EVENING' })])
    );
    expect(alone.taken.filter(Boolean)).toHaveLength(1);
    expect(alone.violations.map((v) => v.ruleId)).toEqual(['BR-H06']);

    const department = await factories.departments.create();
    const shifts = [await factories.shifts.create({ department, date: WEEK.monday, type: 'MORNING' }), await factories.shifts.create({ department, date: WEEK.monday, type: 'EVENING' })];
    await team(factories, department, 2);
    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
    expect(timeRuleBreaks(workByEmployee(shifts, schedule.assignments!))).toEqual([]);
  });

  test('T20 a shift in another ward\'s approved schedule keeps a float nurse off an overlapping shift here, a draft does not', { tag: '@T20' }, async ({ api, factories }) => {
    const [wardA, wardB, wardC] = [await factories.departments.create(), await factories.departments.create(), await factories.departments.create()];
    const [float] = await team(factories, wardA, 1);
    const morningA = await factories.shifts.create({ department: wardA, date: WEEK.monday, type: 'MORNING' });
    // Ward B has the float nurse on Monday from 08:00 to 12:00 in an approved schedule.
    const shiftB = await factories.shifts.create({ department: wardB, date: WEEK.monday, start: '08:00', end: '12:00' });
    const scheduleB = await factories.schedules.create({ department: wardB, start: WEEK.monday });
    await api.PLANNER.schedules.assign(scheduleB.id, shiftB.id, float!.id);
    await api.PLANNER.schedules.generate(scheduleB.id);
    await api.PLANNER.schedules.step(scheduleB.id, 'submit');
    await api.MANAGER.schedules.step(scheduleB.id, 'approve');
    // Ward C has her at the same time only in a draft, which is not a commitment yet.
    const shiftC = await factories.shifts.create({ department: wardC, date: WEEK.tuesday, start: '08:00', end: '12:00' });
    const scheduleC = await factories.schedules.create({ department: wardC, start: WEEK.monday });
    await api.PLANNER.schedules.assign(scheduleC.id, shiftC.id, float!.id);
    const tuesdayA = await factories.shifts.create({ department: wardA, date: WEEK.tuesday, type: 'MORNING' });

    const { schedule, violations } = await factories.schedules.createGenerated({ department: wardA, start: WEEK.monday });
    expect(schedule.assignments!.map((a) => a.shiftId)).toEqual([tuesdayA.id]);
    expect(violations).toEqual([expect.objectContaining({ ruleId: 'BR-H06', shiftId: morningA.id })]);
  });

  test('T20 a hand-made double booking is reported as BR-H03 for the person', { tag: '@T20' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const morning = await factories.shifts.create({ department, date: WEEK.monday, type: 'MORNING' });
    const evening = await factories.shifts.create({ department, date: WEEK.monday, type: 'EVENING' });
    const [nurse] = await team(factories, department, 1);
    const schedule = await factories.schedules.create({ department, start: WEEK.monday });
    await api.PLANNER.schedules.assign(schedule.id, morning.id, nurse!.id);
    await api.PLANNER.schedules.assign(schedule.id, evening.id, nurse!.id);
    const { violations } = await api.PLANNER.schedules.check(schedule.id);
    expect(violations.filter((v) => v.ruleId === 'BR-H03').map((v) => v.employeeId)).toEqual([nurse!.id, nurse!.id]);
  });

  test('T21 exactly 40 hours in a week is allowed, one more minute is not (BR-H04)', { tag: '@T21' }, async ({ factories }) => {
    // Four 10 hour days make 40 h. A 1 minute shift on Saturday would make 40 h 1 min.
    const { taken, violations, shifts } = await soloNurse(factories, async (department) => {
      const list: Shift[] = [];
      for (const date of DAYS.slice(0, 4)) list.push(await factories.shifts.create({ department, date, start: '07:00', end: '17:00' }));
      list.push(await factories.shifts.create({ department, date: DAYS[5]!, start: '07:00', end: '07:01' }));
      return list;
    });
    expect(taken).toEqual([true, true, true, true, false]);
    expect(violations).toEqual([expect.objectContaining({ ruleId: 'BR-H06', shiftId: shifts[4]!.id })]);
  });

  test('T21 hours already approved in another ward count toward the 40', { tag: '@T21' }, async ({ api, factories }) => {
    const [wardA, wardB] = [await factories.departments.create(), await factories.departments.create()];
    const [nurse] = await team(factories, wardA, 1);
    // 32 h in ward B from Monday to Thursday, approved.
    const scheduleB = await factories.schedules.create({ department: wardB, start: WEEK.monday });
    for (const date of DAYS.slice(0, 4)) {
      const shift = await factories.shifts.create({ department: wardB, date });
      await api.PLANNER.schedules.assign(scheduleB.id, shift.id, nurse!.id);
    }
    await api.PLANNER.schedules.generate(scheduleB.id);
    await api.PLANNER.schedules.step(scheduleB.id, 'submit');
    await api.MANAGER.schedules.step(scheduleB.id, 'approve');
    // Ward A offers Friday and Saturday mornings: only one fits in the 8 h left.
    const shiftsA = [await factories.shifts.create({ department: wardA, date: DAYS[4]! }), await factories.shifts.create({ department: wardA, date: DAYS[5]! })];
    const { schedule, violations } = await factories.schedules.createGenerated({ department: wardA, start: WEEK.monday });
    expect(schedule.assignments).toHaveLength(1);
    expect(violations.map((v) => v.ruleId)).toEqual(['BR-H06']);
    expect(shiftsA.map((s) => s.id)).toContain(schedule.assignments![0]!.shiftId);
  });

  test('T22 exactly 11 hours of rest is allowed, one minute less is not (BR-H05)', { tag: '@T22' }, async ({ factories }) => {
    const pair = (end: string) => (department: Department) =>
      Promise.all([
        factories.shifts.create({ department, date: WEEK.monday, start: '12:00', end }),
        factories.shifts.create({ department, date: WEEK.tuesday, start: '07:00', end: '15:00' })
      ]);
    expect((await soloNurse(factories, pair('20:00'))).taken).toEqual([true, true]);
    expect((await soloNurse(factories, pair('20:01'))).taken.filter(Boolean)).toHaveLength(1);
  });

  test('T22 rest is real elapsed time: across the spring clock change 12 hours on the clock are only 11 (BR-H05, BR-T02)', { tag: '@T22' }, async ({ factories }) => {
    // Helsinki moves from 03:00 to 04:00 on Sunday 30 March 2031. The week of that Sunday starts on 24 March.
    const pair = (end: string) => (department: Department) =>
      Promise.all([
        factories.shifts.create({ department, date: '2031-03-29', start: '13:00', end }),
        factories.shifts.create({ department, date: '2031-03-30', start: '09:00', end: '17:00' })
      ]);
    // 21:00 to 09:00 shows 12 h on the clock but lasts 11 h: allowed. 21:01 leaves 10 h 59 min: not allowed.
    expect((await soloNurse(factories, pair('21:00'), '2031-03-24')).taken).toEqual([true, true]);
    const short = await soloNurse(factories, pair('21:01'), '2031-03-24');
    expect(short.taken.filter(Boolean)).toHaveLength(1);
    expect(short.violations.map((v) => v.ruleId)).toEqual(['BR-H06']);
  });

  test('T22 evening then next morning, and night then same-day evening, are never given to one person', { tag: '@T22' }, async ({ factories }) => {
    const department = await factories.departments.create();
    const shifts: Shift[] = [];
    for (const date of DAYS.slice(0, 6)) {
      for (const type of ['MORNING', 'EVENING', 'NIGHT'] as const) shifts.push(await factories.shifts.create({ department, date, type }));
    }
    await team(factories, department, 7);
    const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
    expect(timeRuleBreaks(workByEmployee(shifts, schedule.assignments!))).toEqual([]);
  });

  test('T23 every place is filled when the team can cover it, and the shortage is exact when it cannot (BR-H06)', { tag: '@T23' }, async ({ factories }) => {
    // A week of mornings for 2 people each: 14 places of 8 h. Each person can work at most 5 of them (40 h).
    const plan = async (people: number) => {
      const department = await factories.departments.create();
      const shifts: Shift[] = [];
      for (const date of DAYS) shifts.push(await factories.shifts.create({ department, date, headcount: 2 }));
      await team(factories, department, people);
      const { schedule, violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
      const filled = shifts.map((s) => schedule.assignments!.filter((a) => a.shiftId === s.id).length);
      return { shifts, filled, violations, work: workByEmployee(shifts, schedule.assignments!) };
    };
    const enough = await plan(3);
    expect(enough.filled).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(enough.violations).toEqual([]);
    expect(timeRuleBreaks(enough.work)).toEqual([]);

    // Two people give 10 places at most, so exactly 4 places stay open, each one reported on its shift.
    const short = await plan(2);
    expect(short.filled.reduce((a, b) => a + b, 0)).toBe(10);
    expect([...weekMinutes(short.work, WEEK.monday).values()]).toEqual([2400, 2400]);
    const missing = short.shifts.flatMap((s, i) => (short.filled[i]! < 2 ? [s.id] : []));
    expect(short.violations.map((v) => v.shiftId).sort((a, b) => a - b)).toEqual(missing.sort((a, b) => a - b));
    expect(short.violations.every((v) => v.ruleId === 'BR-H06')).toBe(true);
    expect(timeRuleBreaks(short.work)).toEqual([]);
  });
});
