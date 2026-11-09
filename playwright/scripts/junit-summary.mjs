// Turns Playwright's JUnit file into a Markdown summary for the CI run page, and fails when the run proves nothing:
// no test at all, or a skipped test (the suite has none on purpose, so a skip means a test was switched off).
// Usage: node scripts/junit-summary.mjs test-results/junit.xml >> "$GITHUB_STEP_SUMMARY"
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/junit-summary.mjs <junit.xml>');
  process.exit(2);
}
const xml = readFileSync(file, 'utf8');
const number = (name) => Number(new RegExp(`<testsuites[^>]*\\s${name}="(\\d+(?:\\.\\d+)?)"`).exec(xml)?.[1] ?? 0);
const tests = number('tests');
const failures = number('failures') + number('errors');
const skipped = number('skipped');
const seconds = number('time');

// Every <testcase> that holds a <failure>, by suite and name.
const failed = [...xml.matchAll(/<testcase name="([^"]*)"[^>]*classname="([^"]*)"[^>]*>([\s\S]*?)<\/testcase>/g)]
  .filter(([, , , body]) => body.includes('<failure'))
  .map(([, name, classname]) => `${classname} › ${name}`);

const unescape = (text) => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const lines = [
  '## Playwright',
  '',
  '| Tests | Passed | Failed | Skipped | Time |',
  '|---|---|---|---|---|',
  `| ${tests} | ${tests - failures - skipped} | ${failures} | ${skipped} | ${Math.round(seconds)} s |`,
  ''
];
if (failed.length > 0) lines.push('Failed:', '', ...failed.map((name) => `- ${unescape(name)}`), '');
console.log(lines.join('\n'));

const problems = [];
if (tests === 0) problems.push('no test ran');
if (skipped > 0) problems.push(`${skipped} test(s) skipped`);
if (failures > 0) problems.push(`${failures} test(s) failed`);
if (problems.length > 0) {
  console.error(`Quality gate: ${problems.join(', ')}`);
  process.exit(1);
}
