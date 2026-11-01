import { describe, expect, it } from 'vitest';
import type { AvailabilityKind } from './engine.types.js';
import { engineInput, ruleIds, shift } from './engine.fixtures.js';
import { checkCandidate } from './hard-constraints.js';

// BR-H02: no UNAVAILABLE or LEAVE interval of the employee overlaps the shift.
describe('BR-H02 availability', () => {
  const morning = shift(1, '2026-11-02T06:00:00+02:00', '2026-11-02T14:00:00+02:00');
  const record = (type: AvailabilityKind, startsAt: string, endsAt: string, employeeId = 1) => ({
    employeeId,
    type,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt)
  });

  it('accepts a shift that starts exactly when the leave ends', () => {
    const input = engineInput({
      shifts: [morning],
      availability: [record('LEAVE', '2026-11-01T22:00:00+02:00', '2026-11-02T06:00:00+02:00')]
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1))).toEqual([]);
  });

  it('refuses the shift when the leave ends one minute later', () => {
    const input = engineInput({
      shifts: [morning],
      availability: [record('LEAVE', '2026-11-01T22:00:00+02:00', '2026-11-02T06:01:00+02:00')]
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1))).toEqual(['BR-H02']);
  });

  it('refuses a shift during time marked UNAVAILABLE', () => {
    const input = engineInput({
      shifts: [morning],
      availability: [record('UNAVAILABLE', '2026-11-02T10:00:00+02:00', '2026-11-02T12:00:00+02:00')]
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1))).toEqual(['BR-H02']);
  });

  it('treats AVAILABLE as a preference, not a rule', () => {
    const input = engineInput({
      shifts: [morning],
      availability: [record('AVAILABLE', '2026-11-02T00:00:00+02:00', '2026-11-03T00:00:00+02:00')]
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1))).toEqual([]);
  });

  it('ignores the leave of another employee', () => {
    const input = engineInput({
      shifts: [morning],
      availability: [record('LEAVE', '2026-11-02T00:00:00+02:00', '2026-11-03T00:00:00+02:00', 2)]
    });
    expect(ruleIds(checkCandidate(input, [], 1, 1))).toEqual([]);
  });
});
