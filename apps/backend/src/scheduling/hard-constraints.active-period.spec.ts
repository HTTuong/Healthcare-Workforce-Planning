import { describe, expect, it } from 'vitest';
import { employee, engineInput, ruleIds, shift } from './engine.fixtures.js';
import { checkCandidate } from './hard-constraints.js';

// BR-H07 active employees only, and BR-T03 shifts inside the planning period (19/10 to 15/11 2026 in the fixture).
describe('BR-H07 active and BR-T03 period', () => {
  it('refuses an inactive employee', () => {
    const input = engineInput({
      shifts: [shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00')],
      employees: [employee(1, { active: false })]
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1))).toEqual(['BR-H07']);
  });

  it('accepts a shift on the last day that ends at the midnight after it', () => {
    const input = engineInput({ shifts: [shift(1, '2026-11-15T16:00:00+02:00', '2026-11-16T00:00:00+02:00')] });
    expect(ruleIds(checkCandidate(input, [], 1, 1))).toEqual([]);
  });

  it('refuses a night shift that starts on the last day and ends after the period', () => {
    const input = engineInput({
      shifts: [shift(1, '2026-11-15T22:00:00+02:00', '2026-11-16T06:00:00+02:00', { type: 'NIGHT' })]
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1))).toEqual(['BR-T03']);
  });

  it('accepts a shift that starts at the first local midnight of the period and refuses one before it', () => {
    const atStart = engineInput({ shifts: [shift(1, '2026-10-19T00:00:00+03:00', '2026-10-19T08:00:00+03:00')] });
    const before = engineInput({ shifts: [shift(1, '2026-10-18T23:59:00+03:00', '2026-10-19T08:00:00+03:00')] });
    expect(ruleIds(checkCandidate(atStart, [], 1, 1))).toEqual([]);
    expect(ruleIds(checkCandidate(before, [], 1, 1))).toEqual(['BR-T03']);
  });

  it('throws for an unknown shift or employee, which is a programming error, not a rule violation', () => {
    const input = engineInput({ shifts: [shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00')] });
    expect(() => checkCandidate(input, [], 99, 1)).toThrow('Unknown shift 99');
    expect(() => checkCandidate(input, [], 1, 99)).toThrow('Unknown employee 99');
  });
});
