import { describe, expect, it } from 'vitest';
import type { EngineAssignment, EngineShift } from './engine.types.js';
import { engineInput, ruleIds, shift } from './engine.fixtures.js';
import { checkCandidate } from './hard-constraints.js';

// BR-H04: at most 2400 minutes in a Monday to Sunday week of Helsinki time.
describe('BR-H04 weekly hours', () => {
  // Four 8 hour day shifts, Monday 2/11 to Thursday 5/11 2026: 1920 minutes.
  const fourDays: EngineShift[] = [2, 3, 4, 5].map((day) =>
    shift(day, `2026-11-0${day}T06:00:00+02:00`, `2026-11-0${day}T14:00:00+02:00`)
  );
  const plan: EngineAssignment[] = fourDays.map((s) => ({ shiftId: s.id, employeeId: 1 }));

  it('accepts exactly 40 hours', () => {
    const input = engineInput({ shifts: [...fourDays, shift(6, '2026-11-06T06:00:00+02:00', '2026-11-06T14:00:00+02:00')] });
    expect(ruleIds(checkCandidate(input, plan, 6, 1))).toEqual([]);
  });

  it('refuses 40 hours and 1 minute', () => {
    const input = engineInput({ shifts: [...fourDays, shift(6, '2026-11-06T06:00:00+02:00', '2026-11-06T14:01:00+02:00')] });
    expect(ruleIds(checkCandidate(input, plan, 6, 1))).toEqual(['BR-H04']);
  });

  it('splits a shift that crosses Monday 00:00 between the two weeks', () => {
    // Sunday 8/11 20:00 to Monday 9/11 06:00: 240 minutes in the first week, 360 in the second.
    // Counted whole, 1920 + 600 would break the limit. Split, the first week has 2160 minutes.
    const input = engineInput({ shifts: [...fourDays, shift(9, '2026-11-08T20:00:00+02:00', '2026-11-09T06:00:00+02:00')] });
    expect(ruleIds(checkCandidate(input, plan, 9, 1))).toEqual([]);
  });

  it('names the week that breaks the limit', () => {
    const fifth = shift(6, '2026-11-06T06:00:00+02:00', '2026-11-06T14:00:00+02:00');
    const sundayNight = shift(9, '2026-11-08T20:00:00+02:00', '2026-11-09T06:00:00+02:00');
    const input = engineInput({ shifts: [...fourDays, fifth, sundayNight] });
    const violations = checkCandidate(input, [...plan, { shiftId: 6, employeeId: 1 }], 9, 1);
    expect(ruleIds(violations)).toEqual(['BR-H04']);
    expect(violations[0]?.message).toContain('week of 2026-11-02');
  });

  it('counts the night over the end of daylight saving time as 9 hours', () => {
    // Week 19/10 to 25/10 2026: four 8 hour shifts and the 9 hour night make 2460 minutes.
    const days: EngineShift[] = [19, 20, 21, 22].map((day) =>
      shift(day, `2026-10-${day}T06:00:00+03:00`, `2026-10-${day}T14:00:00+03:00`)
    );
    const night = shift(24, '2026-10-24T22:00:00+03:00', '2026-10-25T06:00:00+02:00', { type: 'NIGHT' });
    const input = engineInput({ shifts: [...days, night] });
    const assigned = days.map((s) => ({ shiftId: s.id, employeeId: 1 }));
    const violations = checkCandidate(input, assigned, 24, 1);
    expect(ruleIds(violations)).toEqual(['BR-H04']);
    expect(violations[0]?.message).toContain('2460 minutes');
  });

  it('counts work from the previous period in the same week', () => {
    const input = engineInput({
      period: { start: '2026-11-04', end: '2026-11-30' },
      shifts: [shift(6, '2026-11-06T06:00:00+02:00', '2026-11-06T14:01:00+02:00')],
      busy: [2, 3, 4, 5].map((day) => ({
        employeeId: 1,
        startsAt: new Date(`2026-11-0${day}T06:00:00+02:00`),
        endsAt: new Date(`2026-11-0${day}T14:00:00+02:00`)
      }))
    });
    expect(ruleIds(checkCandidate(input, [], 6, 1))).toEqual(['BR-H04']);
  });

  it('uses the configured limit', () => {
    const input = engineInput({
      shifts: [shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00')],
      rules: { minRestMinutes: 660, maxWeeklyMinutes: 479, timeZone: 'Europe/Helsinki' }
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1))).toEqual(['BR-H04']);
  });
});
