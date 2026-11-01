import { describe, expect, it } from 'vitest';
import { schedule } from './engine.js';
import { employee, engineInput, shift } from './engine.fixtures.js';
import type { EngineAssignment } from './engine.types.js';
import { overtimeScore, QUALITY_WEIGHTS, qualityReport } from './soft-scores.js';

// BR-S04 overtime and the combined quality score (day 18/11).
const day = (id: number, date: string) => shift(id, `${date}T06:00:00+02:00`, `${date}T14:00:00+02:00`);
const on = (shiftId: number, employeeId: number): EngineAssignment => ({ shiftId, employeeId });
// Monday 2/11 to Friday 6/11 2026, five 8 hour shifts.
const week = [2, 3, 4, 5, 6].map((d) => day(d, `2026-11-0${d}`));

describe('overtimeScore (BR-S04)', () => {
  it('is 100 when nothing is assigned', () => {
    expect(overtimeScore(engineInput({ shifts: week }), [])).toBe(100);
  });

  it('is 100 when a week stays within the contract', () => {
    const input = engineInput({ shifts: week, employees: [employee(1, { contractMinutesPerWeek: 2400 })] });
    expect(overtimeScore(input, week.map((s) => on(s.id, 1)))).toBe(100);
  });

  it('is the share of assigned minutes that are not overtime', () => {
    // Half time, 1200 minutes, working three 8 hour shifts: 240 of 1440 minutes are overtime.
    const input = engineInput({ shifts: week, employees: [employee(1, { contractMinutesPerWeek: 1200 })] });
    expect(overtimeScore(input, [on(2, 1), on(3, 1), on(4, 1)])).toBeCloseTo(100 * (1 - 240 / 1440));
  });

  it('measures each week on its own instead of summing the period', () => {
    const nextWeek = [9, 10, 11, 12, 13].map((d) => day(d, `2026-11-${String(d).padStart(2, '0')}`));
    const input = engineInput({ shifts: [...week, ...nextWeek], employees: [employee(1, { contractMinutesPerWeek: 2400 })] });
    expect(overtimeScore(input, [...week, ...nextWeek].map((s) => on(s.id, 1)))).toBe(100);
  });

  it('splits a shift that crosses Monday 00:00 between the two weeks', () => {
    // Sunday 20:00 to Monday 06:00 is 240 + 360 minutes, both within a 480 minute contract. Counted whole it would be 600.
    const input = engineInput({
      shifts: [shift(1, '2026-11-08T20:00:00+02:00', '2026-11-09T06:00:00+02:00', { type: 'NIGHT' })],
      employees: [employee(1, { contractMinutesPerWeek: 480 })]
    });
    expect(overtimeScore(input, [on(1, 1)])).toBe(100);
  });

  it('lets busy time fill the week first, without blaming the schedule for overtime the busy time causes alone', () => {
    const busy = (minutes: number) => [
      { employeeId: 1, startsAt: new Date('2026-11-02T14:00:00+02:00'), endsAt: new Date(new Date('2026-11-02T14:00:00+02:00').getTime() + minutes * 60_000) }
    ];
    const contract = [employee(1, { contractMinutesPerWeek: 480 })];
    // Week already full: the 480 assigned minutes are all overtime.
    expect(overtimeScore(engineInput({ shifts: week, employees: contract, busy: busy(480) }), [on(3, 1)])).toBe(0);
    // Week over full by busy time alone: still only the 480 assigned minutes count, so the score stays at 0, not below.
    expect(overtimeScore(engineInput({ shifts: week, employees: contract, busy: busy(600) }), [on(3, 1)])).toBe(0);
    // Half full: 240 of the 480 assigned minutes are overtime.
    expect(overtimeScore(engineInput({ shifts: week, employees: contract, busy: busy(240) }), [on(3, 1)])).toBe(50);
  });

  it('ignores employees without contract hours', () => {
    const input = engineInput({ shifts: week, employees: [employee(1, { contractMinutesPerWeek: 0 })] });
    expect(overtimeScore(input, week.map((s) => on(s.id, 1)))).toBe(100);
  });
});

describe('qualityReport', () => {
  it('uses weights that add up to 1', () => {
    const total = Object.values(QUALITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('is the weighted average of the four scores', () => {
    const input = engineInput({
      shifts: [shift(1, '2026-11-02T22:00:00+02:00', '2026-11-03T06:00:00+02:00', { type: 'NIGHT' }), day(4, '2026-11-04')],
      employees: [employee(1), employee(2)]
    });
    const report = qualityReport(input, [on(1, 1), on(4, 1)]);
    const expected =
      QUALITY_WEIGHTS.preference * report.preference +
      QUALITY_WEIGHTS.fairness * report.fairness +
      QUALITY_WEIGHTS.workload * report.workload +
      QUALITY_WEIGHTS.overtime * report.overtime;
    expect(report.quality).toBeCloseTo(expected, 12);
    expect(report.fairness).toBeCloseTo(50);
    expect(report.workload).toBeCloseTo(50);
  });

  it('gives 100 to a schedule that is perfect on every goal', () => {
    const input = engineInput({ shifts: [day(2, '2026-11-02'), day(3, '2026-11-03')], employees: [employee(1), employee(2)] });
    expect(qualityReport(input, [on(2, 1), on(3, 2)]).quality).toBeCloseTo(100);
  });
});

describe('ranking by quality', () => {
  it('gives the shift to the employee who stays within the contract', () => {
    const input = engineInput({
      shifts: [day(2, '2026-11-02'), day(3, '2026-11-03')],
      employees: [employee(1, { contractMinutesPerWeek: 480 }), employee(2, { contractMinutesPerWeek: 480 })],
      lockedAssignments: [on(2, 1)]
    });
    expect(schedule(input).assignments).toEqual([on(2, 1), on(3, 2)]);
  });

  it('keeps the employee order out of the result, even when two candidates score the same', () => {
    const input = engineInput({ shifts: week, employees: [employee(1), employee(2), employee(3)] });
    const reversed = { ...input, employees: [...input.employees].reverse() };
    expect(schedule(reversed).assignments).toEqual(schedule(input).assignments);
  });
});
