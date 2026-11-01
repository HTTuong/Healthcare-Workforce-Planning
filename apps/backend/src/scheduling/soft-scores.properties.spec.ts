import { describe, expect, it } from 'vitest';
import { schedule } from './engine.js';
import { randomInput, seededRandom } from './engine.fixtures.js';
import { softScores } from './soft-scores.js';

// Properties of the soft scores on 300 seeded random inputs and the engine's schedules for them.
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

describe('soft scores: properties on random inputs', () => {
  it('always lie between 0 and 100', () => {
    for (const seed of SEEDS) {
      const input = randomInput(seed);
      for (const [name, value] of Object.entries(softScores(input, schedule(input).assignments))) {
        expect(value, `seed ${seed}, ${name}`).toBeGreaterThanOrEqual(0);
        expect(value, `seed ${seed}, ${name}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('do not depend on the order of the input or of the assignments', () => {
    for (const seed of SEEDS) {
      const input = randomInput(seed);
      const assignments = schedule(input).assignments;
      const reordered = {
        ...input,
        shifts: shuffled(input.shifts, seed),
        employees: shuffled(input.employees, seed + 1),
        availability: shuffled(input.availability, seed + 2)
      };
      const a = softScores(input, assignments);
      const b = softScores(reordered, shuffled(assignments, seed + 3));
      expect(b.preference, `seed ${seed}`).toBeCloseTo(a.preference, 9);
      expect(b.fairness, `seed ${seed}`).toBeCloseTo(a.fairness, 9);
      expect(b.workload, `seed ${seed}`).toBeCloseTo(a.workload, 9);
    }
  });

  it('give 100 for an empty schedule, where nobody is favoured', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      expect(softScores(randomInput(seed), []), `seed ${seed}`).toEqual({ preference: 100, fairness: 100, workload: 100 });
    }
  });
});
