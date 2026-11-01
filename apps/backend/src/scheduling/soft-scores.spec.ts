import { describe, expect, it } from 'vitest';
import { employee, engineInput, shift } from './engine.fixtures.js';
import type { EngineAssignment } from './engine.types.js';
import { fairnessScore, gini, isUnpopular, preferenceScore, softScores, workloadScore } from './soft-scores.js';

const TZ = 'Europe/Helsinki';
// Monday 2/11 to Thursday 5/11 2026, 8 hour day shifts, and two nights.
const day = (id: number, date: string) => shift(id, `${date}T06:00:00+02:00`, `${date}T14:00:00+02:00`);
const night = (id: number, date: string, next: string) =>
  shift(id, `${date}T22:00:00+02:00`, `${next}T06:00:00+02:00`, { type: 'NIGHT' });
const on = (shiftId: number, employeeId: number): EngineAssignment => ({ shiftId, employeeId });

describe('gini', () => {
  it('is 0 for equal values, for all zeros and for fewer than two values', () => {
    expect(gini([3, 3, 3])).toBe(0);
    expect(gini([0, 0])).toBe(0);
    expect(gini([5])).toBe(0);
    expect(gini([])).toBe(0);
  });

  it('gives (n - 1) / n when one value holds everything', () => {
    expect(gini([0, 0, 0, 1])).toBeCloseTo(0.75);
    expect(gini([0, 4])).toBeCloseTo(0.5);
  });

  it('matches a value worked out by hand', () => {
    // Sum of |a - b| over all ordered pairs of 1, 2, 3, 4 is 20, and 2 x n x total is 2 x 4 x 10 = 80.
    expect(gini([1, 2, 3, 4])).toBeCloseTo(0.25);
  });

  it('does not depend on the unit, so minutes and hours give the same result', () => {
    expect(gini([60, 120, 480])).toBeCloseTo(gini([1, 2, 8]));
  });
});

describe('isUnpopular', () => {
  it('counts every night shift and every shift that starts on a local Saturday or Sunday', () => {
    expect(isUnpopular(night(1, '2026-11-03', '2026-11-04'), TZ)).toBe(true);
    expect(isUnpopular(day(1, '2026-11-07'), TZ)).toBe(true);
    expect(isUnpopular(day(1, '2026-11-08'), TZ)).toBe(true);
    expect(isUnpopular(day(1, '2026-11-06'), TZ)).toBe(false);
  });

  it('uses the Helsinki day, not the UTC day', () => {
    // Monday 9/11 00:30 local is still Sunday 22:30 in UTC.
    expect(isUnpopular(shift(1, '2026-11-09T00:30:00+02:00', '2026-11-09T08:30:00+02:00'), TZ)).toBe(false);
    // Saturday 7/11 01:00 local is Friday 23:00 in UTC.
    expect(isUnpopular(shift(1, '2026-11-07T01:00:00+02:00', '2026-11-07T09:00:00+02:00'), TZ)).toBe(true);
  });
});

describe('preferenceScore (BR-S01)', () => {
  const shifts = [day(1, '2026-11-02'), day(2, '2026-11-03')];
  const mondayAvailable = {
    employeeId: 1,
    type: 'AVAILABLE' as const,
    startsAt: new Date('2026-11-02T00:00:00+02:00'),
    endsAt: new Date('2026-11-03T00:00:00+02:00')
  };

  it('is the share of assignments inside AVAILABLE time', () => {
    const input = engineInput({ shifts, availability: [mondayAvailable] });
    expect(preferenceScore(input, [on(1, 1), on(2, 1)])).toBe(50);
    expect(preferenceScore(input, [on(1, 1)])).toBe(100);
    expect(preferenceScore(input, [on(2, 1)])).toBe(0);
  });

  it('needs the AVAILABLE time to cover the whole shift', () => {
    const partly = { ...mondayAvailable, endsAt: new Date('2026-11-02T13:00:00+02:00') };
    expect(preferenceScore(engineInput({ shifts, availability: [partly] }), [on(1, 1)])).toBe(0);
  });

  it('leaves out employees who never stated a preference, and is 100 when nobody did', () => {
    const input = engineInput({ shifts, employees: [employee(1), employee(2)], availability: [mondayAvailable] });
    expect(preferenceScore(input, [on(1, 1), on(2, 2)])).toBe(100);
    expect(preferenceScore(engineInput({ shifts }), [on(1, 1), on(2, 1)])).toBe(100);
  });
});

describe('fairnessScore (BR-S02)', () => {
  const shifts = [night(1, '2026-11-02', '2026-11-03'), night(2, '2026-11-04', '2026-11-05'), day(3, '2026-11-06')];
  const two = [employee(1), employee(2)];

  it('is 100 when the unpopular shifts are shared evenly', () => {
    expect(fairnessScore(engineInput({ shifts, employees: two }), [on(1, 1), on(2, 2)])).toBeCloseTo(100);
  });

  it('is 50 when one of two equal employees gets every night', () => {
    expect(fairnessScore(engineInput({ shifts, employees: two }), [on(1, 1), on(2, 1), on(3, 2)])).toBeCloseTo(50);
  });

  it('compares relative to the contract, so half time with half the nights is even', () => {
    const fourNights = [1, 2, 3, 4].map((n) => night(n, `2026-11-0${n + 1}`, `2026-11-0${n + 2}`));
    const input = engineInput({
      shifts: fourNights,
      employees: [employee(1, { contractMinutesPerWeek: 2400 }), employee(2, { contractMinutesPerWeek: 1200 })]
    });
    // 3 nights on 2400 minutes and 1 night on 1200: per 1000 minutes 1.25 and 0.833. Ordered pair differences
    // sum to 0.833, and 2 x n x total is 2 x 2 x 2.083 = 8.33, so gini = 0.1 and the score is 90.
    expect(fairnessScore(input, [on(1, 1), on(2, 1), on(3, 1), on(4, 2)])).toBeCloseTo(90);
    expect(fairnessScore(input, [on(1, 1), on(2, 1), on(3, 2)])).toBeCloseTo(100);
  });

  it('leaves out inactive employees and employees without contract hours', () => {
    const input = engineInput({
      shifts,
      employees: [employee(1), employee(2, { active: false }), employee(3, { contractMinutesPerWeek: 0 })]
    });
    expect(fairnessScore(input, [on(1, 1), on(2, 1)])).toBeCloseTo(100);
  });
});

describe('workloadScore (BR-S03)', () => {
  const shifts = [day(1, '2026-11-02'), day(2, '2026-11-03')];

  it('is 100 for the same minutes on the same contract, and 50 when one of two does all the work', () => {
    const input = engineInput({ shifts, employees: [employee(1), employee(2)] });
    expect(workloadScore(input, [on(1, 1), on(2, 2)])).toBeCloseTo(100);
    expect(workloadScore(input, [on(1, 1), on(2, 1)])).toBeCloseTo(50);
  });

  it('counts real minutes, so a 9 hour night over the end of daylight saving time weighs more than 8 hours', () => {
    const input = engineInput({
      shifts: [
        shift(1, '2026-10-24T22:00:00+03:00', '2026-10-25T06:00:00+02:00', { type: 'NIGHT' }),
        shift(2, '2026-10-26T06:00:00+02:00', '2026-10-26T14:00:00+02:00')
      ],
      employees: [employee(1), employee(2)]
    });
    // 540 and 480 minutes: ordered pair differences sum to 120, and 2 x n x total is 2 x 2 x 1020 = 4080.
    expect(workloadScore(input, [on(1, 1), on(2, 2)])).toBeCloseTo(100 * (1 - 60 / 2040), 5);
  });

  it('compares relative to the contract', () => {
    const input = engineInput({
      shifts: [day(1, '2026-11-02'), day(2, '2026-11-03'), day(3, '2026-11-04')],
      employees: [employee(1, { contractMinutesPerWeek: 2400 }), employee(2, { contractMinutesPerWeek: 1200 })]
    });
    expect(workloadScore(input, [on(1, 1), on(2, 1), on(3, 2)])).toBeCloseTo(100);
  });
});

describe('softScores', () => {
  it('returns all three scores together', () => {
    const input = engineInput({ shifts: [day(1, '2026-11-02')] });
    expect(softScores(input, [on(1, 1)])).toEqual({ preference: 100, fairness: 100, workload: 100 });
  });
});
