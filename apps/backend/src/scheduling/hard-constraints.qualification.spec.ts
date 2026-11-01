import { describe, expect, it } from 'vitest';
import { employee, engineInput, ruleIds, shift } from './engine.fixtures.js';
import { checkCandidate } from './hard-constraints.js';

// BR-H01: the qualification is held and valid for the whole shift.
describe('BR-H01 qualification', () => {
  const RN = 7;

  it('accepts a qualification that never expires', () => {
    const input = engineInput({
      shifts: [shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00')],
      employees: [employee(1, { qualifications: [{ qualificationId: RN, validUntil: null }] })]
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1, [RN]))).toEqual([]);
  });

  it('refuses an employee who does not hold the qualification', () => {
    const input = engineInput({ shifts: [shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00')] });
    expect(ruleIds(checkCandidate(input, [], 1, 1, [RN]))).toEqual(['BR-H01']);
  });

  it('accepts a shift that ends at local midnight after the last valid day', () => {
    const input = engineInput({
      shifts: [shift(1, '2026-11-14T16:00:00+02:00', '2026-11-15T00:00:00+02:00')],
      employees: [employee(1, { qualifications: [{ qualificationId: RN, validUntil: '2026-11-14' }] })]
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1, [RN]))).toEqual([]);
  });

  it('refuses the same shift when it ends one minute later', () => {
    const input = engineInput({
      shifts: [shift(1, '2026-11-14T16:00:00+02:00', '2026-11-15T00:01:00+02:00')],
      employees: [employee(1, { qualifications: [{ qualificationId: RN, validUntil: '2026-11-14' }] })]
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1, [RN]))).toEqual(['BR-H01']);
  });

  it('refuses a night shift that starts on the last valid day but ends on the next one', () => {
    const input = engineInput({
      shifts: [shift(1, '2026-11-14T22:00:00+02:00', '2026-11-15T06:00:00+02:00', { type: 'NIGHT' })],
      employees: [employee(1, { qualifications: [{ qualificationId: RN, validUntil: '2026-11-14' }] })]
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1, [RN]))).toEqual(['BR-H01']);
  });

  it('checks only the qualifications the employee is counted for', () => {
    const input = engineInput({ shifts: [shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00')] });
    expect(ruleIds(checkCandidate(input, [], 1, 1))).toEqual([]);
  });
});
