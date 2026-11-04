import { describe, expect, it } from 'vitest';
import { formatContract, joinContract, splitContract } from './contract';

describe('contract hours', () => {
  it('shows minutes per week as hours and minutes', () => {
    expect(formatContract(2295)).toBe('38 h 15 min');
    expect(formatContract(2400)).toBe('40 h');
    expect(formatContract(0)).toBe('0 h');
    expect(formatContract(59)).toBe('0 h 59 min');
  });

  it('splits and joins without losing a minute', () => {
    for (const minutes of [0, 1, 59, 60, 2295, 10080]) {
      const { hours, minutes: rest } = splitContract(minutes);
      expect(joinContract(hours, rest)).toBe(minutes);
    }
  });

  it('accepts the API limits 0 and 10080 and refuses one minute more', () => {
    expect(joinContract('0', '0')).toBe(0);
    expect(joinContract('168', '0')).toBe(10080);
    expect(joinContract('168', '1')).toBe('A week has at most 168 hours.');
  });

  it('refuses anything but whole numbers, and minutes above 59', () => {
    expect(joinContract('38', '60')).toBe('Minutes must be between 0 and 59.');
    for (const [h, m] of [['', '0'], ['38.5', '0'], ['-1', '0'], ['38', 'x'], ['1e2', '0']]) {
      expect(joinContract(h!, m!), `${h} ${m}`).toBe('Enter whole hours and minutes.');
    }
  });
});
