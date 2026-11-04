import { describe, expect, it } from 'vitest';
import { groupByDay, loadByEmployee } from './schedule-view';
import type { Assignment } from './types';

const shift = (id: number, type: 'MORNING' | 'NIGHT', startsAt: string, endsAt: string, requiredHeadcount = 2) => ({
  id,
  type,
  startsAt,
  endsAt,
  requiredHeadcount
});
const noora = { id: 7, firstName: 'Noora', lastName: 'Nurse' };
const aaro = { id: 8, firstName: 'Aaro', lastName: 'Aalto' };
const assign = (id: number, s: ReturnType<typeof shift>, employee: typeof noora): Assignment => ({
  id,
  shiftId: s.id,
  employeeId: employee.id,
  shift: s,
  employee
});

// The week of the end of summer time, Monday 19 to Sunday 25 October 2026.
const monday = shift(1, 'MORNING', '2026-10-19T04:00:00Z', '2026-10-19T12:00:00Z');
const saturdayNight = shift(2, 'NIGHT', '2026-10-24T19:00:00Z', '2026-10-25T04:00:00Z');
// Sunday 25 October 22:00 local to Monday 06:00: ends after the period, so it is outside it (BR-T03).
const lastNight = shift(3, 'NIGHT', '2026-10-25T20:00:00Z', '2026-10-26T04:00:00Z');
const nextWeek = shift(4, 'MORNING', '2026-10-26T05:00:00Z', '2026-10-26T13:00:00Z');

describe('groupByDay', () => {
  it('groups the shifts inside the period by local date and shows unstaffed ones', () => {
    const groups = groupByDay('2026-10-19', '2026-10-25', [saturdayNight, monday, lastNight, nextWeek], [assign(1, monday, noora)]);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-19', '2026-10-24']);
    expect(groups[0]!.rows[0]!.people).toEqual([noora]);
    expect(groups[1]!.rows[0]!.people).toEqual([]);
  });

  it('keeps an assigned shift that lies outside the period, so nothing assigned is hidden', () => {
    const groups = groupByDay('2026-10-19', '2026-10-25', [monday], [assign(1, lastNight, noora)]);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-19', '2026-10-25']);
  });

  it('sorts people by last name and attaches the violations of each shift', () => {
    const violation = { ruleId: 'BR-H06', shiftId: 1, message: 'Shift 1 has 1 of 2 people' };
    const groups = groupByDay('2026-10-19', '2026-10-25', [monday], [assign(1, monday, noora), assign(2, monday, aaro)], [violation]);
    expect(groups[0]!.rows[0]!.people.map((p) => p.firstName)).toEqual(['Aaro', 'Noora']);
    expect(groups[0]!.rows[0]!.violations).toEqual([violation]);
  });
});

describe('loadByEmployee', () => {
  it('counts shifts, real minutes and nights, most hours first', () => {
    const loads = loadByEmployee([assign(1, monday, noora), assign(2, saturdayNight, aaro), assign(3, lastNight, aaro)]);
    expect(loads.map((l) => [l.employee.firstName, l.shifts, l.minutes, l.nights])).toEqual([
      ['Aaro', 2, 9 * 60 + 8 * 60, 2],
      ['Noora', 1, 8 * 60, 0]
    ]);
  });
});
