import { describe, expect, it } from 'vitest';
import { schedule } from './engine.js';
import { employee, engineInput, ruleIds, shift } from './engine.fixtures.js';
import type { EngineQualification } from './engine.types.js';
import { validateSchedule } from './hard-constraints.js';

const holds = (...ids: number[]): EngineQualification[] => ids.map((qualificationId) => ({ qualificationId, validUntil: null }));
const MORNING = ['2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00'] as const;
const RN = 1;

describe('schedule: basic behaviour', () => {
  it('staffs a shift with the only candidate', () => {
    const result = schedule(engineInput({ shifts: [shift(1, ...MORNING)] }));
    expect(result).toEqual({ assignments: [{ shiftId: 1, employeeId: 1 }], violations: [] });
  });

  it('puts the nurse on the nurse place and fills the other place with someone else', () => {
    const input = engineInput({
      shifts: [shift(1, ...MORNING, { requiredHeadcount: 2, requirements: [{ qualificationId: RN, count: 1 }] })],
      employees: [employee(1), employee(2, { qualifications: holds(RN) })]
    });
    expect(schedule(input)).toEqual({
      assignments: [{ shiftId: 1, employeeId: 1 }, { shiftId: 1, employeeId: 2 }],
      violations: []
    });
  });

  it('never breaks a rule to fill a place, and reports the gap instead', () => {
    const input = engineInput({ shifts: [shift(1, ...MORNING), shift(2, ...MORNING)] });
    const result = schedule(input);
    expect(result.assignments).toEqual([{ shiftId: 1, employeeId: 1 }]);
    expect(ruleIds(result.violations)).toEqual(['BR-H06']);
    expect(result.violations[0]?.shiftId).toBe(2);
  });

  it('does not plan an employee on leave or an inactive employee', () => {
    const input = engineInput({
      shifts: [shift(1, ...MORNING, { requiredHeadcount: 3 })],
      employees: [employee(1), employee(2, { active: false }), employee(3)],
      availability: [{ employeeId: 3, type: 'LEAVE', startsAt: new Date(MORNING[0]), endsAt: new Date(MORNING[1]) }]
    });
    const result = schedule(input);
    expect(result.assignments).toEqual([{ shiftId: 1, employeeId: 1 }]);
    expect(result.violations[0]?.message).toBe('Shift 1 has 1 of 3 required people');
  });

  it('keeps locked assignments and plans around them', () => {
    const input = engineInput({
      shifts: [shift(1, ...MORNING), shift(2, '2026-11-02T14:00:00+02:00', '2026-11-02T22:00:00+02:00')],
      employees: [employee(1), employee(2)],
      lockedAssignments: [{ shiftId: 1, employeeId: 1 }]
    });
    // Employee 1 has the lighter name order but no rest after the locked morning shift.
    expect(schedule(input).assignments).toEqual([{ shiftId: 1, employeeId: 1 }, { shiftId: 2, employeeId: 2 }]);
  });

  it('keeps a locked assignment that breaks a rule and reports it', () => {
    const input = engineInput({
      shifts: [shift(1, ...MORNING)],
      employees: [employee(1, { active: false })],
      lockedAssignments: [{ shiftId: 1, employeeId: 1 }]
    });
    const result = schedule(input);
    expect(result.assignments).toEqual([{ shiftId: 1, employeeId: 1 }]);
    expect(ruleIds(result.violations)).toEqual(['BR-H07']);
  });

  it('does not staff a shift outside the planning period', () => {
    const result = schedule(engineInput({ shifts: [shift(1, '2026-12-01T06:00:00+02:00', '2026-12-01T14:00:00+02:00')] }));
    expect(result.assignments).toEqual([]);
    expect(ruleIds(result.violations)).toEqual(['BR-T03']);
  });
});

describe('schedule: ranking of equal candidates', () => {
  it('spreads the work instead of giving every shift to the first employee', () => {
    const input = engineInput({
      shifts: [shift(1, ...MORNING), shift(2, '2026-11-03T06:00:00+02:00', '2026-11-03T14:00:00+02:00')],
      employees: [employee(1), employee(2)]
    });
    expect(schedule(input).assignments).toEqual([{ shiftId: 1, employeeId: 1 }, { shiftId: 2, employeeId: 2 }]);
  });

  it('prefers the employee who marked the time as AVAILABLE', () => {
    const input = engineInput({
      shifts: [shift(1, ...MORNING)],
      employees: [employee(1), employee(2)],
      availability: [{ employeeId: 2, type: 'AVAILABLE', startsAt: new Date('2026-11-02T00:00:00+02:00'), endsAt: new Date('2026-11-03T00:00:00+02:00') }]
    });
    expect(schedule(input).assignments).toEqual([{ shiftId: 1, employeeId: 2 }]);
  });

  it('gives a night shift to the employee with fewer nights when the load is equal', () => {
    const input = engineInput({
      shifts: [
        shift(1, '2026-11-02T22:00:00+02:00', '2026-11-03T06:00:00+02:00', { type: 'NIGHT' }),
        shift(2, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00'),
        shift(3, '2026-11-05T22:00:00+02:00', '2026-11-06T06:00:00+02:00', { type: 'NIGHT' })
      ],
      employees: [employee(1), employee(2)],
      lockedAssignments: [{ shiftId: 1, employeeId: 1 }, { shiftId: 2, employeeId: 2 }]
    });
    expect(schedule(input).assignments).toContainEqual({ shiftId: 3, employeeId: 2 });
  });

  it('prefers one employee who covers two requirements when places are scarce', () => {
    // Both requirements have two candidates, so only "covers the most open requirements" picks employee 2.
    const input = engineInput({
      shifts: [shift(1, ...MORNING, { requiredHeadcount: 1, requirements: [{ qualificationId: 1, count: 1 }, { qualificationId: 2, count: 1 }] })],
      employees: [
        employee(1, { qualifications: holds(1) }),
        employee(2, { qualifications: holds(1, 2) }),
        employee(3, { qualifications: holds(2) })
      ]
    });
    expect(schedule(input)).toEqual({ assignments: [{ shiftId: 1, employeeId: 2 }], violations: [] });
  });
});

// Cases that earlier versions of the algorithm got wrong, kept so that they stay solved.
describe('schedule: cases an earlier version missed', () => {
  it('staffs the shift whose only candidate is needed, before an easier shift takes that candidate', () => {
    // Shift 1 (needs Q1) could use employee 1 or 2, shift 2 (needs Q2) only employee 1 once shift 3 (needs Q3) has
    // employee 3. A fixed order gave shift 1 employee 1 and left shift 2 empty.
    const input = engineInput({
      shifts: [
        shift(1, ...MORNING, { requirements: [{ qualificationId: 1, count: 1 }] }),
        shift(2, ...MORNING, { requirements: [{ qualificationId: 2, count: 1 }] }),
        shift(3, ...MORNING, { requirements: [{ qualificationId: 3, count: 1 }] })
      ],
      employees: [employee(1, { qualifications: holds(1, 2) }), employee(2, { qualifications: holds(1) }), employee(3, { qualifications: holds(2, 3) })]
    });
    expect(schedule(input)).toEqual({
      assignments: [{ shiftId: 1, employeeId: 2 }, { shiftId: 2, employeeId: 1 }, { shiftId: 3, employeeId: 3 }],
      violations: []
    });
  });

  it('fills a two person morning shift before a night shift takes one of its two candidates', () => {
    // Employee 3 must work night 1 (only holder of the qualification), so cannot rest before the morning. A fixed
    // order (nights first) put employee 1 on night 2, which left the morning with one person.
    const input = engineInput({
      shifts: [
        shift(1, '2026-11-10T23:00:00+02:00', '2026-11-11T07:00:00+02:00', { type: 'NIGHT', requirements: [{ qualificationId: RN, count: 1 }] }),
        shift(2, '2026-11-11T23:00:00+02:00', '2026-11-12T07:00:00+02:00', { type: 'NIGHT' }),
        shift(3, '2026-11-11T07:00:00+02:00', '2026-11-11T15:00:00+02:00', { requiredHeadcount: 2 })
      ],
      employees: [employee(1), employee(2), employee(3, { qualifications: holds(RN) })]
    });
    const result = schedule(input);
    expect(result.violations).toEqual([]);
    expect(result.assignments).toEqual([
      { shiftId: 1, employeeId: 3 },
      { shiftId: 2, employeeId: 3 },
      { shiftId: 3, employeeId: 1 },
      { shiftId: 3, employeeId: 2 }
    ]);
  });
});

describe('schedule: known greedy limit', () => {
  it('can leave a gap although a complete schedule exists (documented in scheduling-engine.md)', () => {
    // Found by comparing the engine with an exhaustive search on small random inputs. Both Q1 holders (employees 2
    // and 3) end up on the night shifts, so neither has 11 h of rest after the day shift, which then lacks Q1.
    const nightStart = '2026-11-02T22:00:00+02:00';
    const nightEnd = '2026-11-03T06:00:00+02:00';
    const input = engineInput({
      shifts: [
        shift(1, nightStart, nightEnd, { type: 'NIGHT', requirements: [{ qualificationId: 2, count: 1 }] }),
        shift(2, '2026-11-02T10:00:00+02:00', '2026-11-02T18:00:00+02:00', { requirements: [{ qualificationId: 1, count: 1 }] }),
        shift(3, nightStart, nightEnd, { type: 'NIGHT', requiredHeadcount: 2, requirements: [{ qualificationId: 2, count: 1 }, { qualificationId: 3, count: 1 }] })
      ],
      employees: [
        employee(1, { qualifications: holds(2, 3) }),
        employee(2, { qualifications: holds(1, 2) }),
        employee(3, { qualifications: holds(1, 3) }),
        employee(4)
      ]
    });
    const result = schedule(input);
    expect(result.violations).toEqual([
      { ruleId: 'BR-H06', shiftId: 2, message: 'Shift 2 has 0 of 1 people with qualification 1 valid for the shift' }
    ]);
    // The complete schedule the engine did not find:
    const complete = [
      { shiftId: 1, employeeId: 2 },
      { shiftId: 2, employeeId: 3 },
      { shiftId: 3, employeeId: 1 },
      { shiftId: 3, employeeId: 4 }
    ];
    expect(validateSchedule(input, complete)).toEqual([]);
  });
});
