import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { EXEMPT, expand, render, validate } from '../src/redirects.ts';

const SOURCE = 'migration/redirects.yaml';
const OUTPUT = 'nginx/redirects.conf';
const map = expand(readFileSync(SOURCE, 'utf8'));

/**
 * Pinned from the old sitemaps (sitemap-{pages,posts,authors,tags}.xml,
 * exported 2026-09-08): 49 addresses, of which /rss/ is exempt by R2. If the
 * map ever covers fewer, an address has been dropped silently.
 */
const OLD_ADDRESSES = 49;

describe('the map itself', () => {
  it('breaks no rule from design §5', () => {
    expect(validate(map)).toEqual([]);
  });

  it('covers every old address', () => {
    expect(map.redirects.length + map.unchanged.length + EXEMPT.length).toBe(OLD_ADDRESSES);
  });

  it('never redirects /rss/', () => {
    const covered = [...map.redirects, ...map.unchanged].map((r) => r.from);
    for (const path of EXEMPT) expect(covered).not.toContain(path);
  });

  it('lands every redirect on an address that is not itself redirected', () => {
    const moves = new Set(map.redirects.map((r) => r.from));
    for (const { from, to } of map.redirects) {
      expect(moves.has(to), `${from} -> ${to} is a chain`).toBe(false);
    }
  });
});

describe('validate', () => {
  const problemsFor = (yaml: string) => validate(expand(yaml));

  it('catches a chain', () => {
    const problems = problemsFor('pages:\n  /a/: /b/\n  /b/: /c/\n');
    expect(problems).toContainEqual(expect.stringContaining('chain'));
  });

  it('catches an address mapped twice', () => {
    const problems = problemsFor('pages:\n  /a/: /b/\norphan_tags:\n  /a/: /c/\n');
    expect(problems).toContainEqual(expect.stringContaining('mapped twice'));
  });

  it('catches a target that is not a path', () => {
    expect(problemsFor('pages:\n  /a/: https://elsewhere.example/x\n')).not.toEqual([]);
  });

  it('catches a redirected /rss/', () => {
    const problems = problemsFor('pages:\n  /rss/: /feed/\n');
    expect(problems).toContainEqual(expect.stringContaining('/rss/'));
  });

  it('rejects an unknown section', () => {
    expect(() => expand('nonsense:\n  /a/: /b/\n')).toThrow(/unknown section/);
  });

  it('does not call an unchanged address a chain', () => {
    // /about-2/ -> /about/, and /about/ is listed as staying put. That is the
    // whole point of the map, not a chain.
    expect(problemsFor('pages:\n  /about/: /about/\n  /about-2/: /about/\n')).toEqual([]);
  });
});

describe('nginx output', () => {
  const conf = render(map.redirects, SOURCE);

  it('matches the committed file', () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(conf);
  });

  it('emits 301 and never 302', () => {
    expect(conf).not.toMatch(/return 302/);
    expect(conf.match(/return 301/g)).toHaveLength(map.redirects.length * 2);
  });

  it('answers both the slashed and the unslashed form of every old address', () => {
    for (const { from } of map.redirects) {
      expect(conf).toContain(`location = ${from} { return 301`);
      expect(conf).toContain(`location = ${from.replace(/\/$/, '')} { return 301`);
    }
  });

  it('always lands on a trailing slash', () => {
    for (const target of conf.matchAll(/return 301 (\S+);/g)) {
      expect(target[1]).toMatch(/\/$/);
    }
  });
});
