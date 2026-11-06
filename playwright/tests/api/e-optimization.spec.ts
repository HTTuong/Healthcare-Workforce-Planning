import type { ApiByRole } from '../../api/ApiClient';
import type { Availability, Department, Employee, Qualification, Shift, ShiftType } from '../../api/types';
import { expect, test } from '../../fixtures/test';
import type { Factories } from '../../factories';
import { timeRuleBreaks, workByEmployee } from '../../utils/hard-rules';
import { addDays, helsinki } from '../../utils/helsinki';
import { scores, unpopular } from '../../utils/soft-scores';
import { WEEK } from '../../utils/test-week';

// Group E, optimization: the engine breaks no hard rule itself and improves the soft goals (BR-S01 to BR-S04). Every
// score the API reports is compared with utils/soft-scores.ts, an independent reading of docs/business-rules.md.

const DAYS = Array.from({ length: 7 }, (_, i) => addDays(WEEK.monday, i));
const at = (date: string, time: string) => helsinki(date, time);
const ms = (iso: string) => Date.parse(iso);

/** A small deterministic random generator (mulberry32), so a failing seed can be run again as it was. */
function random(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)), pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]! };
}

interface Ward {
  department: Department;
  team: Employee[];
  shifts: Shift[];
  availability: Availability[];
  holders: Set<number>;
  permit: Qualification;
}

/** A random week: 3 to 7 people (one maybe inactive), mixed shifts, some needing a permit, some time away. */
async function randomWard(factories: Factories, api: ApiByRole, seed: number): Promise<Ward> {
  const r = random(seed);
  const department = await factories.departments.create();
  const permit = await factories.qualifications.create();
  const team: Employee[] = [];
  const holders = new Set<number>();
  const size = r.int(3, 7);
  for (let i = 0; i < size; i++) {
    const holds = r.next() < 0.4;
    const employee = await factories.employees.createEligibleEmployee({ department, qualifications: holds ? [permit] : [], contractMinutesPerWeek: r.pick([1200, 1800, 2295, 2400]) });
    if (holds) holders.add(employee.id);
    team.push(employee);
  }
  if (r.next() < 0.5) team.push(await factories.employees.createInactiveEmployee({ department }));
  const shifts: Shift[] = [];
  for (const date of DAYS.slice(0, 6)) {
    for (const type of ['MORNING', 'EVENING', 'NIGHT'] as ShiftType[]) {
      if (r.next() < 0.45) continue;
      const headcount = r.int(1, 2);
      const requires = r.next() < 0.3 ? [{ qualification: permit, count: 1 }] : [];
      shifts.push(await factories.shifts.create({ department, date, type, headcount, requires }));
    }
  }
  const availability: Availability[] = [];
  for (const employee of team.filter((e) => e.active)) {
    if (r.next() < 0.5) continue;
    const day = r.pick(DAYS.slice(0, 6));
    const type = r.pick(['UNAVAILABLE', 'LEAVE', 'AVAILABLE'] as const);
    const range = type === 'LEAVE' ? { startsAt: at(day, '00:00'), endsAt: at(addDays(day, 2), '00:00') } : { startsAt: at(day, '06:00'), endsAt: at(day, '23:00') };
    availability.push(await api.ADMIN.availability.create({ employeeId: employee.id, type, ...range }));
  }
  return { department, team, shifts, availability, holders, permit };
}

test.describe('E: optimization (API)', { tag: '@groupE' }, () => {
  test('T24 the engine itself never breaks a hard rule: 8 random weeks, judged independently', { tag: '@T24' }, async ({ api, factories }) => {
    test.setTimeout(120_000);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const ward = await randomWard(factories, api, seed);
      const { schedule, violations, scores: reported } = await factories.schedules.createGenerated({ department: ward.department, start: WEEK.monday });
      const assignments = schedule.assignments!;
      const label = `seed ${seed}`;
      const active = new Set(ward.team.filter((e) => e.active).map((e) => e.id));
      const away = ward.availability.filter((a) => a.type !== 'AVAILABLE');
      // Only BR-H06 may remain, and only on shifts the engine could not fill.
      expect(violations.filter((v) => v.ruleId !== 'BR-H06'), label).toEqual([]);
      expect(assignments.every((a) => active.has(a.employeeId)), `${label}: active ward members only`).toBe(true);
      for (const a of assignments) {
        const shift = ward.shifts.find((s) => s.id === a.shiftId)!;
        const clash = away.find((r) => r.employeeId === a.employeeId && ms(r.startsAt) < ms(shift.endsAt) && ms(shift.startsAt) < ms(r.endsAt));
        expect(clash, `${label}: employee ${a.employeeId} on shift ${shift.id} during time away`).toBeUndefined();
      }
      expect(timeRuleBreaks(workByEmployee(ward.shifts, assignments)), label).toEqual([]);
      // A shift is reported short exactly when it is short: too few people, or too few permit holders.
      const short = ward.shifts.filter((s) => {
        const people = assignments.filter((a) => a.shiftId === s.id).map((a) => a.employeeId);
        expect(people.length, `${label}: shift ${s.id} over its headcount`).toBeLessThanOrEqual(s.requiredHeadcount);
        const needed = s.requirements.reduce((sum, r) => sum + r.count, 0);
        return people.length < s.requiredHeadcount || people.filter((p) => ward.holders.has(p)).length < needed;
      });
      expect([...new Set(violations.map((v) => v.shiftId))].sort((a, b) => a - b), `${label}: reported shortages`).toEqual(short.map((s) => s.id).sort((a, b) => a - b));
      // And the reported scores are the ones the rules define.
      const expected = scores({ employees: ward.team, shifts: ward.shifts, assignments, availability: ward.availability, monday: WEEK.monday });
      for (const key of ['preference', 'fairness', 'workload', 'overtime', 'quality'] as const) {
        expect(reported[key], `${label}: ${key}`).toBeCloseTo(expected[key], 6);
      }
      expect(schedule.qualityScore, label).toBe(Math.round(expected.quality));
    }
  });

  test('T24 a generous team gets a week without any violation', { tag: '@T24' }, async ({ factories }) => {
    const department = await factories.departments.create();
    for (const date of DAYS) for (const type of ['MORNING', 'EVENING', 'NIGHT'] as const) await factories.shifts.create({ department, date, type, headcount: 2 });
    for (let i = 0; i < 14; i++) await factories.employees.createEligibleEmployee({ department });
    const { violations } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(violations).toEqual([]);
  });

  test('T25 people get the shifts they asked for when the rules allow it, and the preference score is 100 (BR-S01)', { tag: '@T25' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const shifts: Shift[] = [];
    for (const date of DAYS.slice(0, 5)) for (const type of ['MORNING', 'EVENING'] as const) shifts.push(await factories.shifts.create({ department, date, type }));
    // The evening person is created first, so she would win every tie: only her preference keeps her off mornings.
    const evenings = await factories.employees.createEligibleEmployee({ department });
    const mornings = await factories.employees.createEligibleEmployee({ department });
    const availability: Availability[] = [];
    for (const date of DAYS.slice(0, 5)) {
      availability.push(await api.ADMIN.availability.create({ employeeId: mornings.id, type: 'AVAILABLE', startsAt: at(date, '06:00'), endsAt: at(date, '16:00') }));
      availability.push(await api.ADMIN.availability.create({ employeeId: evenings.id, type: 'AVAILABLE', startsAt: at(date, '14:00'), endsAt: at(date, '23:00') }));
    }
    const { schedule, scores: reported } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    const who = (type: ShiftType) => [...new Set(schedule.assignments!.filter((a) => shifts.find((s) => s.id === a.shiftId)!.type === type).map((a) => a.employeeId))];
    expect(who('MORNING')).toEqual([mornings.id]);
    expect(who('EVENING')).toEqual([evenings.id]);
    expect(reported.preference).toBe(100);
    expect(scores({ employees: [evenings, mornings], shifts, assignments: schedule.assignments!, availability, monday: WEEK.monday }).preference).toBe(100);
  });

  test('T25 the preference score counts only people who stated a preference, and 100 when nobody did', { tag: '@T25' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    const shifts = [await factories.shifts.create({ department, date: WEEK.monday }), await factories.shifts.create({ department, date: WEEK.tuesday })];
    const [a, b] = [await factories.employees.createEligibleEmployee({ department }), await factories.employees.createEligibleEmployee({ department })];
    const { schedule } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect((await api.PLANNER.schedules.check(schedule.id)).scores.preference).toBe(100);
    // Now one of them would rather work Wednesday only: her assignments no longer match, the other's do not count.
    const wish = await api.ADMIN.availability.create({ employeeId: a.id, type: 'AVAILABLE', startsAt: at(WEEK.wednesday, '06:00'), endsAt: at(WEEK.wednesday, '16:00') });
    const now = await api.PLANNER.schedules.check(schedule.id);
    const expected = scores({ employees: [a, b], shifts, assignments: schedule.assignments!, availability: [wish], monday: WEEK.monday });
    expect(now.scores.preference).toBeCloseTo(expected.preference, 6);
    const hers = schedule.assignments!.filter((x) => x.employeeId === a.id).length;
    expect(now.scores.preference).toBe(hers === 0 ? 100 : 0);
  });

  test('T26 nights and weekends are shared evenly between people with the same contract (BR-S02)', { tag: '@T26' }, async ({ factories }) => {
    const department = await factories.departments.create();
    const shifts: Shift[] = [];
    for (const date of DAYS.slice(0, 4)) shifts.push(await factories.shifts.create({ department, date, type: 'NIGHT' }));
    for (const date of DAYS.slice(5, 7)) shifts.push(await factories.shifts.create({ department, date, type: 'MORNING' }));
    const team = [await factories.employees.createEligibleEmployee({ department }), await factories.employees.createEligibleEmployee({ department })];
    const { schedule, scores: reported } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    // 4 nights and 2 weekend mornings: 6 unpopular shifts, 3 each.
    const count = (employee: Employee) => schedule.assignments!.filter((a) => a.employeeId === employee.id && unpopular(shifts.find((s) => s.id === a.shiftId)!)).length;
    expect(team.map(count)).toEqual([3, 3]);
    expect(reported.fairness).toBe(100);
  });

  test('T26 work follows the contract: a half-time nurse gets half as many hours (BR-S03)', { tag: '@T26' }, async ({ factories }) => {
    const department = await factories.departments.create();
    for (const date of DAYS.slice(0, 6)) await factories.shifts.create({ department, date });
    const full = await factories.employees.createEligibleEmployee({ department, contractMinutesPerWeek: 2400 });
    const half = await factories.employees.createEligibleEmployee({ department, contractMinutesPerWeek: 1200 });
    const { schedule, scores: reported } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    const count = (employee: Employee) => schedule.assignments!.filter((a) => a.employeeId === employee.id).length;
    expect([count(full), count(half)]).toEqual([4, 2]);
    expect(reported.workload).toBe(100);
    expect(reported.overtime).toBe(100);
  });

  test('T27 overtime is avoided when the team allows it (BR-S04)', { tag: '@T27' }, async ({ factories }) => {
    const department = await factories.departments.create();
    for (const date of DAYS.slice(0, 5)) await factories.shifts.create({ department, date });
    // 16 h of contract: two 8 h shifts at most without overtime.
    const short = await factories.employees.createEligibleEmployee({ department, contractMinutesPerWeek: 960 });
    await factories.employees.createEligibleEmployee({ department, contractMinutesPerWeek: 2400 });
    const { schedule, scores: reported } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    expect(schedule.assignments!.filter((a) => a.employeeId === short.id).length).toBeLessThanOrEqual(2);
    expect(reported.overtime).toBe(100);
  });

  test('T27 unavoidable overtime is measured as the share of minutes above the contract', { tag: '@T27' }, async ({ factories }) => {
    const department = await factories.departments.create();
    const shifts: Shift[] = [];
    for (const date of DAYS.slice(0, 3)) shifts.push(await factories.shifts.create({ department, date }));
    const only = await factories.employees.createEligibleEmployee({ department, contractMinutesPerWeek: 960 });
    const { schedule, violations, scores: reported } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    // 24 h worked on a 16 h contract: 8 of the 24 hours are overtime, the shifts are still filled (overtime is soft).
    expect(violations).toEqual([]);
    expect(schedule.assignments).toHaveLength(3);
    expect(reported.overtime).toBeCloseTo((100 * 2) / 3, 6);
    expect(scores({ employees: [only], shifts, assignments: schedule.assignments!, availability: [], monday: WEEK.monday }).overtime).toBeCloseTo(reported.overtime, 6);
  });

  test('T28 the quality score is the weighted average, saved rounded at generation and cleared by a hand edit', { tag: '@T28' }, async ({ api, factories }) => {
    const department = await factories.departments.create();
    for (const date of DAYS.slice(0, 3)) await factories.shifts.create({ department, date, type: 'NIGHT' });
    await factories.employees.createEligibleEmployee({ department, contractMinutesPerWeek: 960 });
    await factories.employees.createEligibleEmployee({ department, contractMinutesPerWeek: 2400 });
    const { schedule, scores: reported } = await factories.schedules.createGenerated({ department, start: WEEK.monday });
    const weighted = 0.3 * reported.overtime + 0.25 * reported.preference + 0.25 * reported.fairness + 0.2 * reported.workload;
    expect(reported.quality).toBeCloseTo(weighted, 9);
    expect(schedule.qualityScore).toBe(Math.round(reported.quality));
    expect((await api.PLANNER.schedules.check(schedule.id)).scores).toEqual(reported);

    // A hand edit makes the saved score stale, so it is cleared until the next generation.
    const [first] = schedule.assignments!;
    await api.PLANNER.delete(`/schedules/${schedule.id}/assignments/${first!.id}`);
    expect(await api.PLANNER.schedules.get(schedule.id)).toMatchObject({ status: 'DRAFT', qualityScore: null });
  });
});
