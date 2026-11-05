import { describe, expect, it } from 'vitest';
import { parseRouteId } from './route-id';

describe('parseRouteId', () => {
  it('accepts 1 to 2147483647', () => {
    expect(parseRouteId('1')).toBe(1);
    expect(parseRouteId('2147483647')).toBe(2147483647);
  });

  it('refuses everything the API would refuse', () => {
    for (const value of ['0', '2147483648', '99999999999', 'abc', '1.5', '-1', '01', '', ' 1', '1e3', undefined]) {
      expect(parseRouteId(value), String(value)).toBeNull();
    }
  });
});
