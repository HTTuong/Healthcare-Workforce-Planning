import { describe, expect, it } from 'vitest';
import { employee, engineInput, shift } from './engine.fixtures.js';
import { addDays, startOfLocalDate } from './local-time.js';
import { overtimeScore, qualityReport, softScores } from './soft-scores.js';

// Edge cases found with the coverage report (day 19/11): paths no other test reached.
const morning = shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00');

describe('local time input checks', () => {
  it('refuses a date that is not written YYYY-MM-DD, instead of guessing', () => {
    expect(() => addDays('2026-1-2', 1)).toThrow('Not a local date: 2026-1-2');
    expect(() => startOfLocalDate('02.11.2026', 'Europe/Helsinki')).toThrow('Not a local date');
  });
});

describe('soft scores with assignments the input does not know', () => {
  it('skip an assignment to an unknown shift, unlike the hard checks, which throw', () => {
    const input = engineInput({ shifts: [morning], employees: [employee(1), employee(2)] });
    const known = [{ shiftId: 1, employeeId: 1 }];
    expect(softScores(input, [...known, { shiftId: 99, employeeId: 2 }])).toEqual(softScores(input, known));
  });

  it('count no overtime for an employee the input does not know', () => {
    const input = engineInput({ shifts: [morning] });
    expect(overtimeScore(input, [{ shiftId: 1, employeeId: 42 }])).toBe(100);
  });
});

describe('busy time edge cases', () => {
  it('ignores a busy interval of zero minutes', () => {
    const at = new Date('2026-11-02T14:00:00+02:00');
    const contract = [employee(1, { contractMinutesPerWeek: 480 })];
    const withZero = engineInput({ shifts: [morning], employees: contract, busy: [{ employeeId: 1, startsAt: at, endsAt: at }] });
    const without = engineInput({ shifts: [morning], employees: contract });
    expect(qualityReport(withZero, [{ shiftId: 1, employeeId: 1 }])).toEqual(qualityReport(without, [{ shiftId: 1, employeeId: 1 }]));
  });
});
