#!/usr/bin/env node
/**
 * R10, as a gate: "Every build emits three outputs: HTML, markdown, llms.txt.
 * Not an add-on but the foundation: missing one means the build failed."
 *
 *   node scripts/check-outputs.ts [dist]
 *
 * The load-bearing check is the third one. Under the index-file swap in
 * nginx/site.conf.example, an address whose directory has no `index.md` is a
 * 404 for a client that asked for markdown — a silent, per-address failure that
 * nothing else would catch. Adding an HTML route and forgetting its markdown
 * twin is the easy mistake, so the build refuses instead.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';

/** Not addresses: nginx serves them through error_page, never by negotiation. */
const NOT_ADDRESSES = new Set(['404.html']);

const problems: string[] = [];

const read = (path: string) => {
  try {
    return readFileSync(join(dist, path), 'utf8');
  } catch {
    return null;
  }
};

const required = (path: string, check?: (body: string) => string | null) => {
  const body = read(path);
  if (body === null) return problems.push(`missing ${path}`);
  if (!body.trim()) return problems.push(`${path} is empty`);
  const complaint = check?.(body);
  if (complaint) problems.push(`${path}: ${complaint}`);
};

required('llms.txt');
required('llms-full.txt');
required('index.html');
required('index.md');
required('index.json', (body) => {
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed.posts) ? null : 'no `posts` array';
  } catch (error) {
    return `is not valid JSON (${(error as Error).message})`;
  }
});

/** Every negotiable address must answer in both HTML and markdown. */
const walk = (dir: string) => {
  for (const entry of readdirSync(join(dist, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(rel);
    } else if (entry.name === 'index.html' && !NOT_ADDRESSES.has(rel)) {
      const twin = join(dist, dir, 'index.md');
      try {
        statSync(twin);
      } catch {
        problems.push(`/${dir}/ serves HTML but has no index.md twin`);
      }
    }
  }
};
walk('');

if (problems.length) {
  console.error(`R10: ${dist} is not a complete build — ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`R10: ${dist} emits HTML, markdown and llms.txt.`);
