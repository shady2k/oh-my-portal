import { describe, expect, it } from 'vitest';

import { EXEMPT, againstBuild, expand, render, renderS3, validate } from '../src/redirects.ts';

/**
 * The library, against a fixture.
 *
 * The real map used to live in this repository and these tests ran against it,
 * which made them stronger than what is here now: 51 genuine addresses through
 * the genuine library beats any example I invent. It moved out because a
 * migration map describes one specific site and this repository carries no site
 * of its own (design §2) — and, more sharply, because the map is an input to the
 * same build as the articles it points at. Versioned apart, they drift, and a
 * 301 starts landing on an article that is not in that build.
 *
 * So exhaustiveness is now the content repository's check to run, against its
 * own `migration/old-addresses.txt`. What stays here is what the engine actually
 * owns: that the rules of §5 are enforced and that the rendering is correct.
 *
 * The fixture below is deliberately shaped like a real map — every section, a
 * tag that keeps its name, a page that stays put, an orphan pointing at an
 * article — because the interesting bugs live in the interaction between
 * sections, not inside one.
 */
const FIXTURE = `
posts:
  staryi-slag:      new-slug
  drugoi-slag:      another-slug

pages:
  /:                /
  /about/:          /about/
  /about-2/:        /about/
  /home/:           /

tags:
  k3s:              kubernetes
  kubernetes:       kubernetes

orphan_tags:
  /tag/odinokii/:   /posts/new-slug/
`;

const map = expand(FIXTURE);

describe('a well-formed map', () => {
  it('breaks no rule from design §5', () => {
    expect(validate(map)).toEqual([]);
  });

  it('separates addresses that move from addresses that stay', () => {
    expect(map.redirects.map((r) => r.from).sort()).toEqual([
      '/about-2/',
      '/drugoi-slag/',
      '/home/',
      '/staryi-slag/',
      '/tag/k3s/',
      '/tag/odinokii/',
    ]);
    expect(map.unchanged.map((r) => r.from).sort()).toEqual(['/', '/about/', '/tag/kubernetes/']);
  });

  it('expands each section with its own address shape', () => {
    const to = (from: string) => [...map.redirects, ...map.unchanged].find((r) => r.from === from)?.to;
    expect(to('/staryi-slag/')).toBe('/posts/new-slug/');
    expect(to('/tag/k3s/')).toBe('/tag/kubernetes/');
    expect(to('/tag/odinokii/')).toBe('/posts/new-slug/');
    expect(to('/home/')).toBe('/');
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
  const conf = render(map.redirects, 'fixture');

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

  it('names its source, so the generated file cannot be mistaken for a hand-edited one', () => {
    expect(conf).toContain('Generated from fixture');
    expect(conf).toContain('DO NOT EDIT');
  });
});

describe('renderS3', () => {
  const moved = expand(`
posts:
  old-address: new-address
`);

  it('emits both the slashed and the bare key for every redirect', () => {
    expect(renderS3(moved.redirects)).toEqual([
      { key: 'old-address/index.html', location: '/posts/new-address/' },
      { key: 'old-address', location: '/posts/new-address/' },
    ]);
  });

  it('refuses the site root, whose key would overwrite the front page', () => {
    expect(() => renderS3([{ from: '/', to: '/posts/x/', section: 'pages' }])).toThrow(
      /root cannot be a redirect source/,
    );
  });
});

describe('againstBuild', () => {
  const built = new Set(['/', '/archive/', '/posts/new-address/']);
  const serves = (path: string) => built.has(path);
  const r = (from: string, to: string) => ({ from, to, section: 'pages' });

  it('lets through a redirect from a vacant address to a built page', () => {
    expect(againstBuild([r('/old/', '/posts/new-address/')], serves)).toEqual({
      live: [r('/old/', '/posts/new-address/')],
      held: [],
      problems: [],
    });
  });

  it('refuses a source the build serves, because its object would overwrite the page', () => {
    const { problems } = againstBuild([r('/archive/', '/posts/new-address/')], serves);
    expect(problems.join('\n')).toMatch(/`\/archive\/` is a page in this build/);
  });

  it('holds back a redirect whose target is not built, a draft most often', () => {
    const { live, held } = againstBuild([r('/old/', '/posts/a-draft/')], serves);
    expect(live).toEqual([]);
    expect(held).toEqual([r('/old/', '/posts/a-draft/')]);
  });
});
