import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The engine is a pure function of its input (docs/scheduling-engine.md, "Boundaries"). These checks keep it that
// way: they read the engine's own source files and fail when one of them reaches outside the folder, for example
// into NestJS, Prisma or the database client, or when it uses the clock, randomness or the environment.

const folder = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(folder)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.fixtures.ts'))
  .map((name) => ({ name, code: readFileSync(join(folder, name), 'utf8') }));

/** Every module a file imports, from static imports, re-exports and dynamic imports. */
function importsOf(code: string): string[] {
  const found = [
    ...code.matchAll(/\b(?:import|export)\s[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g),
    ...code.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
    ...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)
  ];
  return found.map((match) => match[1]!);
}

/** The code without comments, so a comment that mentions Date.now() is not reported. */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('scheduling engine architecture', () => {
  it('finds the engine source files', () => {
    expect(sources.map((source) => source.name).sort()).toEqual(
      ['engine.ts', 'engine.types.ts', 'hard-constraints.ts', 'local-time.ts', 'soft-scores.ts'].sort()
    );
  });

  it('imports only files of its own folder, so no NestJS, Prisma, database or HTTP code reaches it', () => {
    const outside = sources.flatMap(({ name, code }) =>
      importsOf(code)
        .filter((module) => !/^\.\/[\w.-]+\.js$/.test(module))
        .map((module) => `${name} imports ${module}`)
    );
    expect(outside).toEqual([]);
  });

  it('does not read the clock, use randomness or read the environment, so the same input gives the same output', () => {
    const forbidden: Array<[RegExp, string]> = [
      [/\bDate\.now\s*\(/, 'Date.now()'],
      [/\bnew\s+Date\s*\(\s*\)/, 'new Date() without an argument'],
      [/\bperformance\.now\s*\(/, 'performance.now()'],
      [/\bMath\.random\s*\(/, 'Math.random()'],
      [/\bprocess\.env\b/, 'process.env'],
      [/\bconsole\.\w+\s*\(/, 'console output']
    ];
    const found = sources.flatMap(({ name, code }) =>
      forbidden.filter(([pattern]) => pattern.test(withoutComments(code))).map(([, label]) => `${name} uses ${label}`)
    );
    expect(found).toEqual([]);
  });

  it('recognises the kinds of imports it must catch', () => {
    const sample = [
      "import { Injectable } from '@nestjs/common';",
      "import type { Employee } from '../generated/prisma/client.js';",
      "export { x } from './local-time.js';",
      "import 'reflect-metadata';",
      "const m = await import('../prisma/prisma.service.js');"
    ].join('\n');
    expect(importsOf(sample)).toEqual([
      '@nestjs/common',
      '../generated/prisma/client.js',
      './local-time.js',
      'reflect-metadata',
      '../prisma/prisma.service.js'
    ]);
  });
});
