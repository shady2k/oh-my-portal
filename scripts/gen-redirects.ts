#!/usr/bin/env node
/**
 * Turns the redirect map into nginx configuration.
 *
 *   node scripts/gen-redirects.ts [--check] [map.yaml] [out.conf]
 *
 * `--check` writes nothing and exits non-zero if the committed output is stale.
 * The generated file is committed on purpose: a diff on it is the review of a
 * change to production routing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expand, render, validate } from '../src/redirects.ts';

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const [source = 'migration/redirects.yaml', out = 'nginx/redirects.conf'] = argv.filter(
  (a) => !a.startsWith('--'),
);

const map = expand(readFileSync(source, 'utf8'));
const problems = validate(map);
if (problems.length) {
  console.error(`${source}: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const rendered = render(map.redirects, source);

if (check) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    /* missing counts as stale */
  }
  if (current !== rendered) {
    console.error(`${out} is stale — run \`npm run redirects\` and commit the result.`);
    process.exit(1);
  }
  console.log(`${out} is up to date (${map.redirects.length} redirects).`);
} else {
  writeFileSync(out, rendered);
  console.log(
    `${out}: ${map.redirects.length} redirects, ` +
      `${map.unchanged.length} addresses unchanged, ${map.redirects.length + map.unchanged.length} covered.`,
  );
}
