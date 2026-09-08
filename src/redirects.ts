import { parse as parseYaml } from 'yaml';

/**
 * The migration redirect map — design §5, rules restated in the header of
 * `migration/redirects.yaml`.
 *
 * Astro's own `redirects` config is not used: in a static build it emits
 * meta-refresh HTML and, in Astro's words, "the status code is not used by the
 * server". So the map is data and this module turns it into nginx
 * configuration — real 301s, one source of truth.
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
