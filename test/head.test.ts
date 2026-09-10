import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { build } from './helpers.ts';

/**
 * The head, asserted against a real build.
 *
 * A unit test of `src/seo.ts` proves the strings are composed correctly and
 * proves nothing about whether a page renders them — which is the failure that
 * actually happened: every helper here was correct and no template called any
 * of it, so the site shipped a bare `<title>` and no card for months.
 */
const OUT = 'dist-test-head';
const SITE = 'https://journal.example.test';
const read = (path: string) => readFileSync(join(OUT, path), 'utf8');
const page = (path: string) => read(join(path, 'index.html'));

/** `content="..."`, for the tag whose `property` or `name` is given. */
const meta = (html: string, key: string): string[] =>
  [...html.matchAll(new RegExp(`<meta[^>]*(?:property|name)="${key}"[^>]*>`, 'g'))]
    .map((tag) => /content="([^"]*)"/.exec(tag[0])?.[1] ?? '')
    .filter(Boolean);

const one = (html: string, key: string) => meta(html, key)[0];

const title = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];

const jsonLd = (html: string): Record<string, unknown>[] =>
  [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(
    (block) => JSON.parse(block[1]!),
  );

describe('the head of a built page', () => {
  beforeAll(() => build({}, OUT), 180_000);

  it('names the site in every title, so a tab is not just «Поиск»', () => {
    expect(title(page('search'))).toBe('Поиск — Тестовый Автор');
    expect(title(page('projects'))).toBe('Проекты — Тестовый Автор');
  });

  it('titles the homepage with the site and its headline, not with a section', () => {
    /* It used to say «Записи» while its own h1 said something else entirely. */
    expect(title(read('index.html'))).toMatch(/^Тестовый Автор — /);
  });

  it('leads a tag page with the tag rather than with the word «Тема»', () => {
    expect(title(page('tag/homelab'))).toMatch(/^homelab/);
  });

  it('unfurls: og and twitter carry title, description, url and a card', () => {
    const html = page('posts/published-example');
    expect(one(html, 'og:type')).toBe('article');
    expect(one(html, 'og:title')).toBe('Опубликованная запись');
    expect(one(html, 'og:description')).toBe('Существует в сборке.');
    expect(one(html, 'og:url')).toBe(`${SITE}/posts/published-example/`);
    expect(one(html, 'og:site_name')).toBe('Тестовый Автор');
    expect(one(html, 'og:locale')).toBe('ru_RU');
    expect(one(html, 'og:image')).toBe(`${SITE}/og.png`);
    expect(one(html, 'twitter:card')).toBe('summary_large_image');
    expect(one(html, 'twitter:image')).toBe(`${SITE}/og.png`);
  });

  it('calls a listing a website rather than an article', () => {
    expect(one(page('archive'), 'og:type')).toBe('website');
  });

  it('dates an article and lists its tags for a crawler', () => {
    const html = page('posts/published-example');
    expect(one(html, 'article:published_time')).toBe('2026-01-02T00:00:00.000Z');
    expect(one(html, 'article:modified_time')).toBe('2026-02-03T00:00:00.000Z');
    expect(meta(html, 'article:tag')).toContain('homelab');
    expect(one(html, 'article:author')).toBe('Тестовый Автор');
  });

  it('serves a favicon and points at it', () => {
    expect(read('index.html')).toContain('rel="icon"');
    expect(read('favicon.svg')).toContain('<svg');
  });

  it('carries the card it advertises', () => {
    /* An og:image that 404s is worse than none: the unfurler shows a blank. */
    const png = readFileSync(join(OUT, 'og.png'));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it('emits valid BlogPosting for an article', () => {
    const blocks = jsonLd(page('posts/published-example'));
    const post = blocks.find((block) => block['@type'] === 'BlogPosting');
    expect(post).toBeDefined();
    expect(post!.headline).toBe('Опубликованная запись');
    expect(post!.datePublished).toBe('2026-01-02T00:00:00.000Z');
    expect(post!.mainEntityOfPage).toMatchObject({
      '@id': `${SITE}/posts/published-example/`,
    });
  });

  it('emits WebSite and Person on the homepage', () => {
    const types = jsonLd(read('index.html')).map((block) => block['@type']);
    expect(types).toContain('WebSite');
    expect(types).toContain('Person');
  });

  it('emits a breadcrumb on an article and on a tag page', () => {
    for (const path of ['posts/published-example', 'tag/homelab']) {
      expect(jsonLd(page(path)).map((block) => block['@type'])).toContain('BreadcrumbList');
    }
  });
});

describe('what a crawler is told', () => {
  it('points robots.txt at an absolute sitemap and at llms.txt', () => {
    const robots = read('robots.txt');
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(robots).toContain(`${SITE}/llms.txt`);
    expect(robots).toContain('Disallow: /search/');
  });

  /**
   * The sitemap is hand-rolled (see src/pages/sitemap.xml.ts), so the risk it
   * carries is drift: a route added without anyone adding it here. Comparing it
   * against the addresses the build actually produced turns that from a silent
   * omission into a failing test.
   */
  it('lists exactly the indexable addresses the build produced', () => {
    const listed = new Set(
      [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
        (match) => new URL(match[1]!).pathname,
      ),
    );

    const built = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(OUT, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (entry.name === 'pagefind' || entry.name === '_astro') continue;
          walk(rel);
        } else if (entry.name === 'index.html') {
          const html = read(rel);
          /* noindex and the sitemap must agree: listing a page you asked not to
             be indexed is a contradiction a crawler resolves against you. */
          if (!html.includes('name="robots" content="noindex"')) built.add(`/${dir}${dir ? '/' : ''}`);
        }
      }
    };
    walk('');

    expect([...listed].sort()).toEqual([...built].sort());
  });

  it('keeps the draft out of the sitemap', () => {
    expect(read('sitemap.xml')).not.toContain('draft-example');
  });

  it('dates an article entry from its own updated date', () => {
    expect(read('sitemap.xml')).toContain('<lastmod>2026-02-03T00:00:00.000Z</lastmod>');
  });
});

/**
 * The gate on the placeholder host.
 *
 * Asserted by running the checker against a build made without SITE_URL, rather
 * than by reading the source: this is the one check whose whole value is that it
 * fires, and a check that silently stopped firing would look exactly like a
 * check that never fires.
 */
describe('the SITE_URL gate', () => {
  const PLACEHOLDER_OUT = 'dist-test-placeholder';

  it('refuses a build whose canonical is https://example.com', () => {
    expect(() => build({ SITE_URL: '' }, PLACEHOLDER_OUT)).toThrow();
  }, 180_000);

  /* Runs against the directory the test above left behind — the point is that
     the same artifact passes or fails on the escape hatch alone. */
  it('but lets one through when it is deliberately allowed', () => {
    expect(() =>
      execFileSync('node', ['scripts/check-outputs.ts', PLACEHOLDER_OUT], {
        env: { ...process.env, CHECK_PLACEHOLDER_HOST: 'allow' },
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
