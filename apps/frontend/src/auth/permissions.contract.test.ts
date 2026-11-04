// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from './permissions';

// R-CONS-01: the UI must not hide what the API allows or show what it refuses. The API's own role table is the
// expected table of apps/backend/src/auth/role-matrix.spec.ts, which a backend test checks against the real
// decorators. This test reads that table and compares every route the UI uses with the roles the UI gives it.

const SETS: Record<string, string[]> = {
  ANY: ['ADMIN', 'EMPLOYEE', 'MANAGER', 'PLANNER'],
  STAFF: ['ADMIN', 'MANAGER', 'PLANNER'],
  SCHEDULING: ['ADMIN', 'PLANNER'],
  APPROVAL: ['ADMIN', 'MANAGER'],
  "'ADMIN'": ['ADMIN'],
  "'PUBLIC'": ['PUBLIC']
};

const source = readFileSync(fileURLToPath(new URL('../../../backend/src/auth/role-matrix.spec.ts', import.meta.url)), 'utf8');

function apiTable(): Map<string, string[]> {
  const table = new Map<string, string[]>();
  for (const [, route, set] of source.matchAll(/^\s*'((?:GET|POST|PUT|PATCH|DELETE) [^']+)': ([A-Z]+|'[A-Z]+'),?$/gm)) {
    const roles = SETS[set!];
    if (!roles) throw new Error(`Unknown role set ${set} for ${route}`);
    table.set(route!, roles);
  }
  return table;
}

describe('UI permissions against the API role table', () => {
  const table = apiTable();

  it('reads every row of the API table', () => {
    // Every row of the expected table is one line that starts with two spaces and a quote.
    const rows = source.slice(source.indexOf('const expected'), source.indexOf('\n};', source.indexOf('const expected')));
    expect(table.size).toBe(rows.split('\n').filter((line) => line.startsWith("  '")).length);
    expect(table.get('GET /employees')).toEqual(SETS.STAFF);
  });

  for (const [name, permission] of Object.entries(PERMISSIONS)) {
    it(`${name} gives the same roles as the API`, () => {
      for (const route of permission.api) {
        expect(table.has(route), `${route} is not in the API table`).toBe(true);
        expect([...permission.roles].sort(), route).toEqual(table.get(route));
      }
    });
  }
});
