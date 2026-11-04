import { describe, expect, it } from 'vitest';
import { describeRange, fieldsOf, findOverlap, rangeInstants } from './availability-form';
import type { Availability } from './types';

const record = (id: number, startsAt: string, endsAt: string): Availability => ({ id, employeeId: 7, startsAt, endsAt, type: 'LEAVE' });

describe('rangeInstants', () => {
  it('turns whole days into local midnight to the midnight after the last day', () => {
    const range = rangeInstants({ wholeDays: true, startDate: '2026-11-02', startTime: '', endDate: '2026-11-06', endTime: '' });
    expect(range).toEqual({ startsAt: new Date('2026-11-01T22:00:00Z'), endsAt: new Date('2026-11-06T22:00:00Z') });
  });

  it('counts whole days across the end of summer time by local midnights, 25 hours for 25 October', () => {
    const range = rangeInstants({ wholeDays: true, startDate: '2026-10-25', startTime: '', endDate: '2026-10-25', endTime: '' });
    expect(range).toEqual({ startsAt: new Date('2026-10-24T21:00:00Z'), endsAt: new Date('2026-10-25T22:00:00Z') });
  });

  it('uses the times when the range is not whole days', () => {
    const range = rangeInstants({ wholeDays: false, startDate: '2026-11-02', startTime: '08:00', endDate: '2026-11-02', endTime: '16:00' });
    expect(range).toEqual({ startsAt: new Date('2026-11-02T06:00:00Z'), endsAt: new Date('2026-11-02T14:00:00Z') });
  });

  it('refuses an end at or before the start, a missing time and the skipped spring hour', () => {
    const base = { wholeDays: false, startDate: '2026-11-02', startTime: '08:00', endDate: '2026-11-02', endTime: '08:00' };
    expect(rangeInstants(base)).toBe('The end must be after the start.');
    expect(rangeInstants({ ...base, wholeDays: true, endDate: '2026-11-01' })).toBe('The end must be after the start.');
    expect(rangeInstants({ ...base, endTime: '' })).toBe('Enter a start and an end time.');
    expect(rangeInstants({ ...base, startDate: '' })).toBe('Enter a start and an end date.');
    expect(rangeInstants({ ...base, startDate: '2027-03-28', startTime: '03:15', endDate: '2027-03-28', endTime: '09:00' })).toBe(
      'That time does not exist on this day, because the clocks move forward an hour.'
    );
  });
});

describe('findOverlap', () => {
  const saved = [record(1, '2026-11-02T06:00:00Z', '2026-11-02T14:00:00Z')];

  it('finds a range that shares time, and lets ranges touch at the end', () => {
    expect(findOverlap(saved, new Date('2026-11-02T13:59:00Z'), new Date('2026-11-02T18:00:00Z'))?.id).toBe(1);
    expect(findOverlap(saved, new Date('2026-11-02T14:00:00Z'), new Date('2026-11-02T18:00:00Z'))).toBeUndefined();
    expect(findOverlap(saved, new Date('2026-11-02T02:00:00Z'), new Date('2026-11-02T06:00:00Z'))).toBeUndefined();
    expect(findOverlap(saved, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-03T00:00:00Z'))?.id).toBe(1);
  });

  it('ignores the record being edited', () => {
    expect(findOverlap(saved, new Date('2026-11-02T07:00:00Z'), new Date('2026-11-02T15:00:00Z'), 1)).toBeUndefined();
  });
});

describe('describeRange and fieldsOf', () => {
  it('describes whole days and timed ranges', () => {
    expect(describeRange(new Date('2026-11-01T22:00:00Z'), new Date('2026-11-06T22:00:00Z'))).toBe('Mon 2 Nov 2026 to Fri 6 Nov 2026, whole days');
    expect(describeRange(new Date('2026-11-01T22:00:00Z'), new Date('2026-11-02T22:00:00Z'))).toBe('Mon 2 Nov 2026, whole day');
    expect(describeRange(new Date('2026-11-02T06:00:00Z'), new Date('2026-11-02T14:00:00Z'))).toBe('Mon 2 Nov 2026 08:00 to 16:00');
    expect(describeRange(new Date('2026-11-02T20:00:00Z'), new Date('2026-11-03T05:00:00Z'))).toBe('Mon 2 Nov 2026 22:00 to Tue 3 Nov 2026 07:00');
  });

  it('reads a whole day record back into whole day fields', () => {
    expect(fieldsOf(record(1, '2026-11-01T22:00:00Z', '2026-11-06T22:00:00Z'))).toMatchObject({
      wholeDays: true,
      startDate: '2026-11-02',
      endDate: '2026-11-06'
    });
    expect(fieldsOf(record(1, '2026-11-02T06:00:00Z', '2026-11-02T14:00:00Z'))).toEqual({
      wholeDays: false,
      startDate: '2026-11-02',
      startTime: '08:00',
      endDate: '2026-11-02',
      endTime: '16:00'
    });
  });
});
