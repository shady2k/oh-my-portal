#!/usr/bin/env node
/**
 * Proves, against the running site, what the redirect manifest promises.
 *
 *   node scripts/check-live.ts <site-url> <redirects.json>
 *
 * Every object in the manifest, not a sample: a sample is exactly how one
 * broken address goes unnoticed, and the whole set is seconds of requests.
 * Each must answer 301 — never 302 — with a Location naming its target; each
 * target must answer 200; `/rss/` must answer 200 and not redirect (R2).
 *
 * Every request carries a query string, so what gets checked is the deploy that
 * just happened and not the CDN's cached answer from before it.
 *
 * Built-ins only: this runs in the job that holds the storage keys, and nothing
 * from npm runs there.
 */
import { readFileSync } from 'node:fs';

const [site, manifest] = process.argv.slice(2);
if (!site || !manifest) {
  console.error('usage: check-live.ts <site-url> <redirects.json>');
  process.exit(2);
}

const bust = `check=${Date.now()}`;
const get = (path: string) => fetch(new URL(`${path}?${bust}`, site), { redirect: 'manual' });
/** `old/index.html` is requested as `/old/`, the bare key `old` as `/old`. */
const addressOf = (key: string) => `/${key.replace(/index\.html$/, '')}`;

const objects = JSON.parse(readFileSync(manifest, 'utf8')) as { key: string; location: string }[];
const LIVE_CONCURRENCY = 16;
type Check = () => Promise<string | undefined>;

const checks: Check[] = [];
for (const { key, location } of objects) {
  checks.push(async () => {
    const address = addressOf(key);
    const res = await get(address);
    const to = res.headers.get('location');
    if (res.status !== 301) return `${address}: ${res.status}, expected 301`;
    if (!to || new URL(to, site).pathname !== location) return `${address}: Location ${to}, expected ${location}`;
  });
}

const targets = new Set(objects.map((o) => o.location));
for (const target of targets) {
  checks.push(async () => {
    const res = await get(target);
    if (res.status !== 200) return `target ${target}: ${res.status}, expected 200`;
  });
}

checks.push(async () => {
  const rss = await get('/rss/');
  if (rss.status !== 200) return `/rss/: ${rss.status}, expected 200 and no redirect (R2)`;
});

const problems: string[] = [];
let cursor = 0;
const worker = async () => {
  while (true) {
    const index = cursor++;
    if (index >= checks.length) return;
    try {
      const problem = await checks[index]();
      if (problem) problems.push(problem);
    } catch (error) {
      problems.push(`check ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};
await Promise.all(Array.from({ length: Math.min(LIVE_CONCURRENCY, checks.length) }, worker));

if (problems.length) {
  console.error(`${site}: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${objects.length} redirect objects, ${targets.size} targets and /rss/ answer as they should; concurrency=${LIVE_CONCURRENCY}.`);
