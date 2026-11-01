import { describe, expect, it } from 'vitest';
import { engineInput, ruleIds, shift } from './engine.fixtures.js';
import { checkCandidate } from './hard-constraints.js';

// BR-H03 overlap and BR-H05 rest, tested together because touching shifts sit exactly between the two rules.
describe('BR-H03 overlap and BR-H05 rest', () => {
  it('reports back to back shifts as a rest violation, not as an overlap', () => {
    const input = engineInput({
      shifts: [
        shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00'),
        shift(2, '2026-11-02T14:00:00+02:00', '2026-11-02T22:00:00+02:00')
      ]
    });
    expect(ruleIds(checkCandidate(input, [{ shiftId: 1, employeeId: 1 }], 2, 1))).toEqual(['BR-H05']);
  });

  it('reports a shift that starts one minute before the other ends as an overlap', () => {
    const input = engineInput({
      shifts: [
        shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00'),
        shift(2, '2026-11-02T13:59:00+02:00', '2026-11-02T22:00:00+02:00')
      ]
    });
    expect(ruleIds(checkCandidate(input, [{ shiftId: 1, employeeId: 1 }], 2, 1))).toEqual(['BR-H03']);
  });

  it('accepts exactly 11 hours of rest', () => {
    const input = engineInput({
      shifts: [
        shift(1, '2026-11-02T14:00:00+02:00', '2026-11-02T22:00:00+02:00'),
        shift(2, '2026-11-03T09:00:00+02:00', '2026-11-03T17:00:00+02:00')
      ]
    });
    expect(ruleIds(checkCandidate(input, [{ shiftId: 1, employeeId: 1 }], 2, 1))).toEqual([]);
  });

  it('refuses 10 hours 59 minutes of rest, in both directions', () => {
    const input = engineInput({
      shifts: [
        shift(1, '2026-11-02T14:00:00+02:00', '2026-11-02T22:00:00+02:00'),
        shift(2, '2026-11-03T08:59:00+02:00', '2026-11-03T17:00:00+02:00')
      ]
    });
    expect(ruleIds(checkCandidate(input, [{ shiftId: 1, employeeId: 1 }], 2, 1))).toEqual(['BR-H05']);
    expect(ruleIds(checkCandidate(input, [{ shiftId: 2, employeeId: 1 }], 1, 1))).toEqual(['BR-H05']);
  });

  it('measures rest in real time when daylight saving time ends (clock 10 h, real 11 h)', () => {
    const input = engineInput({
      shifts: [
        shift(1, '2026-10-24T14:00:00+03:00', '2026-10-24T22:00:00+03:00'),
        shift(2, '2026-10-25T08:00:00+02:00', '2026-10-25T16:00:00+02:00')
      ]
    });
    expect(ruleIds(checkCandidate(input, [{ shiftId: 1, employeeId: 1 }], 2, 1))).toEqual([]);
  });

  it('measures rest in real time when daylight saving time starts (clock 11 h, real 10 h)', () => {
    const input = engineInput({
      period: { start: '2027-03-22', end: '2027-04-04' },
      shifts: [
        shift(1, '2027-03-27T14:00:00+02:00', '2027-03-27T22:00:00+02:00'),
        shift(2, '2027-03-28T09:00:00+03:00', '2027-03-28T17:00:00+03:00')
      ]
    });
    expect(ruleIds(checkCandidate(input, [{ shiftId: 1, employeeId: 1 }], 2, 1))).toEqual(['BR-H05']);
  });

  it('counts work from the previous period for rest', () => {
    const input = engineInput({
      shifts: [shift(1, '2026-10-19T14:00:00+03:00', '2026-10-19T22:00:00+03:00')],
      busy: [{ employeeId: 1, startsAt: new Date('2026-10-18T22:00:00+03:00'), endsAt: new Date('2026-10-19T06:00:00+03:00') }]
    });
    const violations = checkCandidate(input, [], 1, 1);
    expect(ruleIds(violations)).toEqual(['BR-H05']);
    expect(violations[0]?.message).toContain('other work');
  });

  it('ignores the shifts of other employees', () => {
    const input = engineInput({
      shifts: [
        shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00'),
        shift(2, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00')
      ]
    });
    expect(ruleIds(checkCandidate(input, [{ shiftId: 1, employeeId: 2 }], 2, 1))).toEqual([]);
  });
});
