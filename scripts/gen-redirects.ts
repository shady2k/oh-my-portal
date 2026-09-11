#!/usr/bin/env node
/**
 * Turns a redirect map into something that serves it.
 *
 *   node scripts/gen-redirects.ts [--check] [--format nginx|s3] [--dist <build>]
 *                                [--coverage <old-addresses.txt>] <map.yaml> <out>
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
 * The map is not the only source: every `aliases` entry in the corpus feeds the
 * same list, so a rename records its old address beside the article instead of
 * in the frozen migration file. `--coverage` takes the old address list and
 * fails if an address is in neither — the map's exhaustiveness, checked at the
 * only place that can see both sources at once.
 *
 * `--check` writes nothing and exits non-zero if the output on disk is stale.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { collectAliases } from './collect-aliases.ts';
import { againstBuild, expand, flatten, mergeAliases, render, renderS3, uncovered, validate } from '../src/redirects.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    check: { type: 'boolean', default: false },
    format: { type: 'string', default: 'nginx' },
    dist: { type: 'string' },
    coverage: { type: 'string' },
  },
});
const [source, out] = positionals;
const { check, format, dist, coverage } = values;

if (!source || !out || (format !== 'nginx' && format !== 's3')) {
  console.error(
    'usage: gen-redirects.ts [--check] [--format nginx|s3] [--dist <build>] [--coverage <old-addresses.txt>] <map.yaml> <out>',
  );
  process.exit(2);
}

const fail = (what: string, problems: string[]): never => {
  console.error(`${what}: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
};

const map = expand(readFileSync(source, 'utf8'));

/** How many old addresses the list held, so the summary can say what it checked. */
let listed: number | undefined;

if (coverage) {
  const addresses = readFileSync(coverage, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const missing = uncovered(map, addresses);
  if (missing.length) fail(coverage, missing.map((a) => `\`${a}\` is an old address the map does not mention`));
  listed = addresses.length;
}

const merged = mergeAliases(map, collectAliases(process.env.CONTENT_DIR ?? 'content/posts'));
const problems = validate(merged);
if (problems.length) fail(source, problems);

const flat = flatten(merged.redirects);
if (flat.problems.length) fail(source, flat.problems);

let redirects = flat.redirects;

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
  /*
   * Each number says what it counted, because two of them are easy to confuse:
   * the redirects are what this wrote — migration entries plus every `aliases`
   * line in the corpus — while the old addresses are the list, which the map
   * must exhaust. The line is read to see that a rename or an import landed, and
   * a count that quietly meant the other thing would read as success.
   */
  const parts = [`${redirects.length} redirects`, `${merged.unchanged.length} addresses unchanged`];
  if (listed !== undefined) parts.push(`${listed} old addresses, all covered`);
  console.log(`${out}: ${parts.join(', ')}.`);
}
