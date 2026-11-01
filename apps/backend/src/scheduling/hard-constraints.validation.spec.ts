import { describe, expect, it } from 'vitest';
import { employee, engineInput, ruleIds, shift } from './engine.fixtures.js';
import { validateSchedule } from './hard-constraints.js';

// Schedule validation, including BR-H06 headcount, on schedules that may have been edited by hand.
describe('schedule validation and BR-H06 headcount', () => {
  const RN = 7;
  const CPR = 8;
  const night = (extra = {}) =>
    shift(1, '2026-11-02T22:00:00+02:00', '2026-11-03T06:00:00+02:00', {
      type: 'NIGHT',
      requiredHeadcount: 2,
      requirements: [{ qualificationId: RN, count: 1 }],
      ...extra
    });
  const nurse = (id: number, validUntil: string | null = null) =>
    employee(id, { qualifications: [{ qualificationId: RN, validUntil }] });

  it('finds nothing wrong with a correctly staffed shift', () => {
    const input = engineInput({ shifts: [night()], employees: [nurse(1), employee(2)] });
    expect(validateSchedule(input, [{ shiftId: 1, employeeId: 1 }, { shiftId: 1, employeeId: 2 }])).toEqual([]);
  });

  it('reports a missing person on the shift, without an employee', () => {
    const input = engineInput({ shifts: [night()], employees: [nurse(1)] });
    const violations = validateSchedule(input, [{ shiftId: 1, employeeId: 1 }]);
    expect(ruleIds(violations)).toEqual(['BR-H06']);
    expect(violations[0]).toMatchObject({ shiftId: 1, message: 'Shift 1 has 1 of 2 required people' });
    expect(violations[0]?.employeeId).toBeUndefined();
  });

  it('reports a missing qualification, also when it expired during the shift', () => {
    const input = engineInput({ shifts: [night()], employees: [nurse(1, '2026-11-02'), employee(2)] });
    const violations = validateSchedule(input, [{ shiftId: 1, employeeId: 1 }, { shiftId: 1, employeeId: 2 }]);
    expect(ruleIds(violations)).toEqual(['BR-H06']);
    expect(violations[0]?.message).toContain('0 of 1 people with qualification 7');
  });

  it('lets one employee count for two requirements', () => {
    const shiftWithTwo = night({ requiredHeadcount: 1, requirements: [{ qualificationId: RN, count: 1 }, { qualificationId: CPR, count: 1 }] });
    const both = employee(1, { qualifications: [{ qualificationId: RN, validUntil: null }, { qualificationId: CPR, validUntil: null }] });
    const input = engineInput({ shifts: [shiftWithTwo], employees: [both] });
    expect(validateSchedule(input, [{ shiftId: 1, employeeId: 1 }])).toEqual([]);
  });

  it('finds a rest violation in a hand edited schedule, on both shifts involved', () => {
    const input = engineInput({
      shifts: [
        shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00'),
        shift(2, '2026-11-02T14:00:00+02:00', '2026-11-02T22:00:00+02:00')
      ]
    });
    const violations = validateSchedule(input, [{ shiftId: 1, employeeId: 1 }, { shiftId: 2, employeeId: 1 }]);
    expect(violations.map((v) => [v.ruleId, v.shiftId])).toEqual([['BR-H05', 1], ['BR-H05', 2]]);
  });

  it('reports an inactive employee kept on a shift', () => {
    const input = engineInput({
      shifts: [shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00')],
      employees: [employee(1, { active: false })]
    });
    expect(ruleIds(validateSchedule(input, [{ shiftId: 1, employeeId: 1 }]))).toEqual(['BR-H07']);
  });

  it('reports a shift outside the period once, and not as missing headcount', () => {
    const input = engineInput({ shifts: [shift(1, '2026-12-01T06:00:00+02:00', '2026-12-01T14:00:00+02:00')] });
    const violations = validateSchedule(input, []);
    expect(violations).toEqual([
      { ruleId: 'BR-T03', shiftId: 1, message: 'Shift 1 is outside the planning period 2026-10-19 to 2026-11-15' }
    ]);
  });

  it('reports the same employee assigned twice to one shift', () => {
    const input = engineInput({ shifts: [shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00', { requiredHeadcount: 1 })] });
    const violations = validateSchedule(input, [{ shiftId: 1, employeeId: 1 }, { shiftId: 1, employeeId: 1 }]);
    expect(ruleIds(violations)).toEqual(['BR-H03']);
  });

  it('gives the same answer every time for the same schedule', () => {
    const input = engineInput({ shifts: [night()], employees: [nurse(1), employee(2)] });
    const schedule = [{ shiftId: 1, employeeId: 2 }];
    expect(validateSchedule(input, schedule)).toEqual(validateSchedule(input, schedule));
  });
});
