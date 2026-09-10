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

/*
 * The placeholder host must not reach a published build.
 *
 * astro.config.mjs falls back to `https://example.com` when SITE_URL is unset,
 * which is right for `astro build` in this repository — it carries no site of
 * its own (§2) and has to stay buildable. It is catastrophic anywhere else: a
 * build without the variable does not fail, it ships pages whose canonical,
 * hreflang, sitemap, feeds and llms.txt all name somebody else's domain. A page
 * that declares a foreign canonical is worse than one that declares none.
 *
 * Checked here rather than in the config for the same reason everything else in
 * this file is: the artifact is the only place the mistake is visible, and this
 * runs on the artifact. Set CHECK_PLACEHOLDER_HOST=allow for a local build that
 * genuinely has no address yet.
 */
const PLACEHOLDER = 'https://example.com';
if (process.env.CHECK_PLACEHOLDER_HOST !== 'allow') {
  const home = read('index.html');
  if (home?.includes(`rel="canonical" href="${PLACEHOLDER}`)) {
    problems.push(
      'canonical points at the https://example.com placeholder — SITE_URL was not set for this build',
    );
  }
}

required('llms.txt');
required('llms-full.txt');
required('index.html');
required('index.md');
/*
 * A staging build must be the mirror image of a production one here, and both
 * halves are worth a gate. A production robots.txt that forgot its sitemap is a
 * site crawlers have to guess their way around; a staging robots.txt that kept
 * `Allow: /` is a rehearsal competing with the real articles for the same
 * search results. The second failure is silent, slow, and expensive to undo.
 */
required('robots.txt', (body) => {
  if (process.env.STAGING === '1') {
    if (!/^Disallow: \/$/m.test(body)) return 'staging build does not disallow crawlers';
    if (body.includes('Sitemap:')) return 'staging build still advertises a sitemap';
    return null;
  }
  return body.includes('Sitemap: http') ? null : 'no absolute Sitemap: line';
});
required('sitemap.xml', (body) => (body.includes('<loc>') ? null : 'no <loc> entries'));
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

/*
 * Every picture an article references must exist in the build.
 *
 * Content images live in the content repository and are copied in by an
 * integration, so the two halves — the markdown that names a file and the file
 * itself — travel separately and can part company without anything failing.
 * A broken image does not break a build, does not appear in a diff, and is the
 * first thing every reader sees. Same argument as the missing twin above: make
 * it a machine's problem before it is a reader's.
 */
const referenced = new Set<string>();
const collect = (dir: string) => {
  for (const entry of readdirSync(join(dist, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) collect(rel);
    else if (entry.name.endsWith('.html') || entry.name.endsWith('.md')) {
      for (const m of readFileSync(join(dist, rel), 'utf8').matchAll(/["(](\/images\/[^"')\s]+)/g)) {
        referenced.add(m[1]);
      }
    }
  }
};
collect('');
for (const path of referenced) {
  try {
    statSync(join(dist, path));
  } catch {
    problems.push(`${path} is referenced but not in the build — is IMAGES_DIR set?`);
  }
}

if (problems.length) {
  console.error(`R10: ${dist} is not a complete build — ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`R10: ${dist} emits HTML, markdown and llms.txt.`);
