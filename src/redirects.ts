import { parse as parseYaml } from 'yaml';

/**
 * The migration redirect map — design §5, rules restated in the header of
 * the content repository’s `migration/redirects.yaml`.
 *
 * Astro's own `redirects` config is not used: in a static build it emits
 * meta-refresh HTML and, in Astro's words, "the status code is not used by the
 * server". So the map is data and this module turns it into real 301s, one
 * source of truth for two deploys: nginx configuration for a server, and
 * redirect objects for object storage, which has none.
 */

export type Redirect = {
  /** Old, site-absolute path with a trailing slash. */
  from: string;
  /** New, site-absolute path with a trailing slash. */
  to: string;
  /** Which section of the map produced this pair — used in error messages. */
  section: string;
};

/** R2: the feed keeps serving at its original address and is never redirected. */
export const EXEMPT = ['/rss/'];

const PATH = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/;

/**
 * Sections differ in what their keys mean, so each declares how a bare key
 * becomes an address. `pages` and `orphan_tags` already carry full paths.
 */
const SECTIONS: Record<string, { from: (k: string) => string; to: (v: string) => string }> = {
  posts: { from: (k) => `/${k}/`, to: (v) => `/posts/${v}/` },
  pages: { from: (k) => k, to: (v) => v },
  tags: { from: (k) => `/tag/${k}/`, to: (v) => `/tag/${v}/` },
  orphan_tags: { from: (k) => k, to: (v) => v },
};

export type ParsedMap = {
  /** Pairs that actually move. These become nginx rules. */
  redirects: Redirect[];
  /**
   * Addresses the map lists but deliberately does not redirect, because the new
   * site serves the same address (`/about/`, the tags that kept their name).
   * They still count towards coverage — the map is a list of old addresses,
   * not only of moves.
   */
  unchanged: Redirect[];
};

/** Expands the YAML map into absolute from/to pairs. Does not validate. */
export function expand(yamlText: string): ParsedMap {
  const doc = parseYaml(yamlText) as Record<string, Record<string, string>>;
  const redirects: Redirect[] = [];
  const unchanged: Redirect[] = [];

  for (const [section, entries] of Object.entries(doc ?? {})) {
    const shape = SECTIONS[section];
    if (!shape) throw new Error(`unknown section \`${section}\` in the redirect map`);
    for (const [key, value] of Object.entries(entries ?? {})) {
      const pair = { from: shape.from(key), to: shape.to(value), section };
      (pair.from === pair.to ? unchanged : redirects).push(pair);
    }
  }
  return { redirects, unchanged };
}

/**
 * The rules from design §5, as checks. Returns every problem rather than
 * throwing on the first, so one run tells you everything that is wrong.
 */
export function validate({ redirects, unchanged }: ParsedMap): string[] {
  const problems: string[] = [];
  const all = [...redirects, ...unchanged];

  const seen = new Map<string, string>();
  for (const { from, to, section } of all) {
    if (!PATH.test(from)) problems.push(`${section}: \`${from}\` is not a site-absolute path with a trailing slash`);
    if (!PATH.test(to)) problems.push(`${section}: target \`${to}\` is not a site-absolute path with a trailing slash`);
    const prior = seen.get(from);
    if (prior) problems.push(`\`${from}\` is mapped twice (${prior} and ${section})`);
    else seen.set(from, section);
  }

  // One hop: a target must not itself be a source that moves. A target that is
  // an *unchanged* address is correct — that is where the traffic should land.
  const moves = new Set(redirects.map((r) => r.from));
  for (const { from, to } of redirects) {
    if (moves.has(to)) problems.push(`chain: \`${from}\` -> \`${to}\`, and \`${to}\` is itself redirected`);
  }

  for (const path of EXEMPT) {
    if (moves.has(path)) problems.push(`\`${path}\` must never be redirected (design §5, R2)`);
  }

  return problems;
}

/**
 * nginx configuration, to be `include`d inside a `server` block.
 *
 * Exact-match locations rather than a `map` plus `if`: nginx resolves `location =`
 * through a hash, the result is greppable when a single address misbehaves, and
 * it avoids `if` inside a location entirely. Both the slashed and unslashed form
 * of every old address are emitted, so a link that lost its trailing slash
 * somewhere still arrives in one hop rather than two.
 */
export function render(redirects: Redirect[], source: string): string {
  const out: string[] = [
    '# Generated from ' + source + ' by scripts/gen-redirects.ts — DO NOT EDIT.',
    '# Regenerate with `npm run redirects`; `npm test` fails if this file is stale.',
    '#',
    '# Include inside a `server` block. Design §5: 301 only, exactly one hop,',
    '# and /rss/ is never redirected.',
    '',
  ];

  const ordered = [...redirects].sort(
    (a, b) => a.section.localeCompare(b.section) || a.from.localeCompare(b.from),
  );
  let section = '';
  for (const r of ordered) {
    if (r.section !== section) {
      section = r.section;
      out.push(`# --- ${section} ---`);
    }
    const bare = r.from.replace(/\/$/, '');
    out.push(`location = ${r.from} { return 301 ${r.to}; }`);
    if (bare) out.push(`location = ${bare} { return 301 ${r.to}; }`);
  }
  out.push('');
  return out.join('\n');
}

/** One object in storage whose only job is to answer an old address with a 301. */
export type RedirectObject = { key: string; location: string };

/**
 * Sorts redirects against what a build actually serves.
 *
 * `validate()` checks the sources of the map against each other and against
 * nothing else. Two things only the build can answer:
 *
 * - A source the build serves is a live page. Its redirect object is uploaded
 *   over it and the page becomes a 301 — from a typo in the map, or from one
 *   `aliases` line in an article, which is a file an agent may write. So it is
 *   an error, not a warning.
 * - A target the build does not serve — a draft, most often — would be a 301
 *   into a 404 that also names the unpublished slug. It is held back and
 *   listed, and appears on its own in the first build that publishes the target.
 */
export function againstBuild(
  redirects: Redirect[],
  serves: (path: string) => boolean,
): { live: Redirect[]; held: Redirect[]; problems: string[] } {
  const live: Redirect[] = [];
  const held: Redirect[] = [];
  const problems: string[] = [];
  for (const r of redirects) {
    if (serves(r.from)) {
      problems.push(`${r.section}: \`${r.from}\` is a page in this build, and its redirect would overwrite it`);
    } else if (!serves(r.to)) {
      held.push(r);
    } else {
      live.push(r);
    }
  }
  return { live, held, problems };
}

/**
 * The same map as `render()`, for a deploy that has no server.
 *
 * Object storage answers a redirect out of an object's own metadata
 * (`x-amz-website-redirect-location`), so each old address becomes a zero-byte
 * object. Two of them, and that is the whole subtlety: the index resolver turns
 * `/old/` into the key `old/index.html`, but a request for `/old` without the
 * trailing slash gets a **302** to `/old/` first — two hops, the first of them a
 * 302, which is exactly what R1 forbids. A bare key alongside it answers that
 * form directly with a 301. Measured, both ways, before this was written.
 *
 * The site root is refused rather than handled: its key would be `index.html`,
 * and a redirect map that silently overwrites the front page is worse than one
 * that fails. `againstBuild()` already refuses it; this is the last line.
 */
export function renderS3(redirects: Redirect[]): RedirectObject[] {
  const out: RedirectObject[] = [];
  const ordered = [...redirects].sort((a, b) => a.from.localeCompare(b.from));
  for (const { from, to } of ordered) {
    if (from === '/') {
      throw new Error('the site root cannot be a redirect source: its key would overwrite index.html');
    }
    const bare = from.replace(/^\//, '').replace(/\/$/, '');
    out.push({ key: `${bare}/index.html`, location: to });
    out.push({ key: bare, location: to });
  }
  return out;
}
