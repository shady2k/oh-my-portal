#!/usr/bin/env node
/**
 * Turns a redirect map into something that serves it.
 *
 *   node scripts/gen-redirects.ts [--check] [--format nginx|s3] [--dist <build>] <map.yaml> <out>
 *
 * `nginx` (the default) writes `location` blocks for whoever self-hosts behind
 * nginx. `s3` writes a JSON manifest of redirect objects for `deploy-s3.ts`,
 * because object storage has no server to configure.
 *
 * Both paths are required and neither has a default. They used to default to
 * `migration/redirects.yaml` and `nginx/redirects.conf`, which quietly assumed
 * this repository owned a site; it does not (design §2). The map lives beside
 * the articles it points at, in the content repository, and the generated
 * output belongs to that deploy.
 *
 * `--dist` checks the map against a finished build: a redirect from an address
 * the build serves fails, and a redirect to an address it does not serve is
 * held back and listed — see `againstBuild()`. Pass it whenever there is a
 * build; without it nothing knows which targets exist.
 *
 * `--check` writes nothing and exits non-zero if the output on disk is stale.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { againstBuild, expand, render, renderS3, validate } from '../src/redirects.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    check: { type: 'boolean', default: false },
    format: { type: 'string', default: 'nginx' },
    dist: { type: 'string' },
  },
});
const [source, out] = positionals;
const { check, format, dist } = values;

if (!source || !out || (format !== 'nginx' && format !== 's3')) {
  console.error('usage: gen-redirects.ts [--check] [--format nginx|s3] [--dist <build>] <map.yaml> <out>');
  process.exit(2);
}

const fail = (what: string, problems: string[]): never => {
  console.error(`${what}: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
};

const map = expand(readFileSync(source, 'utf8'));
const problems = validate(map);
if (problems.length) fail(source, problems);

let redirects = map.redirects;

if (dist) {
  const serves = (path: string) => existsSync(join(dist, path, 'index.html'));
  const sorted = againstBuild(redirects, serves);
  if (sorted.problems.length) fail(dist, sorted.problems);
  if (sorted.held.length) {
    const lines = sorted.held.map((r) => `- \`${r.from}\` → \`${r.to}\` (${r.section})`);
    console.warn(`${sorted.held.length} redirect(s) held back, target not in this build:\n${lines.join('\n')}`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) appendFileSync(summary, `### Redirects held back: target not built\n\n${lines.join('\n')}\n`);
  }
  redirects = sorted.live;
}

const rendered =
  format === 's3' ? JSON.stringify(renderS3(redirects), null, 2) + '\n' : render(redirects, source);

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
  console.log(`${out} is up to date (${redirects.length} redirects).`);
} else {
  writeFileSync(out, rendered);
  console.log(
    `${out}: ${redirects.length} redirects, ` +
      `${map.unchanged.length} addresses unchanged, ${map.redirects.length + map.unchanged.length} covered.`,
  );
}
