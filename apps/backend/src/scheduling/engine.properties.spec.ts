import { describe, expect, it } from 'vitest';
import { schedule } from './engine.js';
import { randomInput, seededRandom } from './engine.fixtures.js';
import type { EngineInput } from './engine.types.js';
import { shiftInPeriod, validateSchedule } from './hard-constraints.js';

// Properties that must hold for every input, checked on 300 seeded random inputs. A failure prints the seed,
// and randomInput(seed) rebuilds exactly that input.
const SEEDS = Array.from({ length: 300 }, (_, index) => index + 1);

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = seededRandom(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function reordered(input: EngineInput, seed: number): EngineInput {
  return {
    ...input,
    shifts: shuffled(input.shifts, seed),
    employees: shuffled(input.employees, seed + 1),
    availability: shuffled(input.availability, seed + 2)
  };
}

describe('schedule: properties on random inputs', () => {
  it('never adds an assignment that breaks an employee level rule', () => {
    for (const seed of SEEDS) {
      const input = randomInput(seed);
      const broken = validateSchedule(input, schedule(input).assignments).filter((v) => v.employeeId !== undefined);
      expect(broken, `seed ${seed}`).toEqual([]);
    }
  });

  it('reports exactly what the independent validation finds', () => {
    for (const seed of SEEDS) {
      const input = randomInput(seed);
      const result = schedule(input);
      expect(result.violations, `seed ${seed}`).toEqual(validateSchedule(input, result.assignments));
    }
  });

  it('never staffs a shift above its headcount or outside the period', () => {
    for (const seed of SEEDS) {
      const input = randomInput(seed);
      for (const shift of input.shifts) {
        const staff = schedule(input).assignments.filter((assignment) => assignment.shiftId === shift.id).length;
        expect(staff, `seed ${seed}, shift ${shift.id}`).toBeLessThanOrEqual(shiftInPeriod(input, shift) ? shift.requiredHeadcount : 0);
      }
    }
  });

  it('gives the same schedule for the same input, in whatever order the input lists things', () => {
    for (const seed of SEEDS) {
      const input = randomInput(seed);
      const first = schedule(input);
      expect(schedule(randomInput(seed)), `seed ${seed}`).toEqual(first);
      expect(schedule(reordered(input, seed)).assignments, `seed ${seed}`).toEqual(first.assignments);
    }
  });
});
