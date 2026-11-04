import { describe, expect, it } from 'vitest';
import { parseHeadcount, parseRequirements, requirementChanges, shiftInstants } from './shift-form';

describe('shiftInstants', () => {
  it('keeps a day shift on its date', () => {
    const result = shiftInstants({ date: '2026-11-02', start: '07:00', end: '15:00' });
    expect(result).toMatchObject({ endDate: '2026-11-02', minutes: 480 });
  });

  it('ends a night shift the next day, 9 hours across the end of summer time', () => {
    const result = shiftInstants({ date: '2026-10-24', start: '22:00', end: '06:00' });
    expect(result).toMatchObject({ endDate: '2026-10-25', minutes: 540 });
  });

  it('ends a night shift the next day, 7 hours across the start of summer time', () => {
    expect(shiftInstants({ date: '2027-03-27', start: '22:00', end: '06:00' })).toMatchObject({ minutes: 420 });
  });

  it('refuses a start inside the missing hour of the spring clock change', () => {
    expect(shiftInstants({ date: '2027-03-28', start: '03:30', end: '11:00' })).toBe(
      'That time does not exist on this day, because the clocks move forward an hour.'
    );
  });

  it('refuses equal times and missing fields', () => {
    expect(shiftInstants({ date: '2026-11-02', start: '07:00', end: '07:00' })).toBe('The end time must differ from the start time.');
    expect(shiftInstants({ date: '', start: '07:00', end: '15:00' })).toBe('Enter the date of the shift.');
    expect(shiftInstants({ date: '2026-11-02', start: '', end: '15:00' })).toBe('Enter a start and an end time.');
  });

  it('treats one minute past the start as a one minute shift, and one minute before as almost a day', () => {
    expect(shiftInstants({ date: '2026-11-02', start: '07:00', end: '07:01' })).toMatchObject({ minutes: 1 });
    expect(shiftInstants({ date: '2026-11-02', start: '07:00', end: '06:59' })).toMatchObject({ minutes: 1439 });
  });
});

describe('parseHeadcount and parseRequirements', () => {
  it('accepts whole numbers from 1', () => {
    expect(parseHeadcount('1')).toBe(1);
    expect(parseHeadcount('0')).toBe('Enter at least 1 person.');
    expect(parseHeadcount('2.5')).toBe('Enter at least 1 person.');
    expect(parseHeadcount('')).toBe('Enter at least 1 person.');
  });

  it('turns rows into requirements and checks them against the headcount', () => {
    expect(parseRequirements([{ qualificationId: '2', count: '1' }, { qualificationId: '5', count: '3' }], 3)).toEqual([
      { qualificationId: 2, count: 1 },
      { qualificationId: 5, count: 3 }
    ]);
    expect(parseRequirements([{ qualificationId: '5', count: '4' }], 3)).toBe('A requirement cannot need more than the 3 people of the shift.');
    expect(parseRequirements([{ qualificationId: '5', count: '0' }], 3)).toBe('A requirement needs at least 1 person.');
    expect(parseRequirements([{ qualificationId: '', count: '1' }], 3)).toBe('Choose a qualification in every requirement row, or remove the row.');
    expect(parseRequirements([{ qualificationId: '5', count: '1' }, { qualificationId: '5', count: '1' }], 3)).toBe(
      'Each qualification can appear only once.'
    );
  });
});

describe('requirementChanges', () => {
  it('sorts every change into the step where the API accepts it', () => {
    const before = [
      { qualificationId: 1, count: 2 },
      { qualificationId: 2, count: 3 },
      { qualificationId: 3, count: 1 },
      { qualificationId: 4, count: 1 }
    ];
    const after = [
      { qualificationId: 2, count: 1 },
      { qualificationId: 3, count: 2 },
      { qualificationId: 4, count: 1 },
      { qualificationId: 5, count: 1 }
    ];
    expect(requirementChanges(before, after)).toEqual({
      removed: [1],
      lowered: [{ qualificationId: 2, count: 1 }],
      raisedOrAdded: [
        { qualificationId: 3, count: 2 },
        { qualificationId: 5, count: 1 }
      ]
    });
  });

  it('changes nothing when nothing changed', () => {
    const same = [{ qualificationId: 1, count: 2 }];
    expect(requirementChanges(same, same)).toEqual({ removed: [], lowered: [], raisedOrAdded: [] });
  });
});
