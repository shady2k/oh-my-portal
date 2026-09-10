import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { build } from './helpers.ts';

/**
 * The routes and the draft rule, asserted against a real build rather than
 * against the helpers that produce it — a page that forgets to filter drafts
 * still passes a unit test of the filter.
 */
const OUT = 'dist-test';
const OUT_PREVIEW = 'dist-test-preview';
const page = (path: string, out = OUT) => join(out, path, 'index.html');

describe('a production build', () => {
  beforeAll(() => build({}, OUT), 120_000);

  it('puts articles under /posts/<slug>/, per design §5', () => {
    expect(existsSync(page('posts/published-example'))).toBe(true);
  });

  it('gives a page to every tag in use', () => {
    expect(existsSync(page('tag/homelab'))).toBe(true);
  });

  it('leaves a draft without an address', () => {
    expect(existsSync(page('posts/draft-example'))).toBe(false);
  });

  it('keeps a draft out of the feed', () => {
    const feed = readFileSync(join(OUT, 'rss/index.xml'), 'utf8');
    expect(feed).toContain('published-example');
    expect(feed).not.toContain('draft-example');
  });

  it('gives no page to a tag only a draft carries', () => {
    // `security` appears on the draft alone, so it is not a tag in use.
    expect(existsSync(page('tag/security'))).toBe(false);
  });

  it('serves the feed at the address R2 requires', () => {
    expect(existsSync(join(OUT, 'rss/index.xml'))).toBe(true);
  });

  it('emits a 404 page', () => {
    expect(existsSync(join(OUT, '404.html'))).toBe(true);
  });
});

describe('a preview build', () => {
  beforeAll(() => build({ PREVIEW: '1' }, OUT_PREVIEW), 120_000);

  it('shows the draft, because that is what a preview is for (design §7)', () => {
    expect(existsSync(page('posts/draft-example', OUT_PREVIEW))).toBe(true);
  });

  it('marks it noindex, so a preview host cannot leak into search', () => {
    expect(readFileSync(page('posts/draft-example', OUT_PREVIEW), 'utf8')).toContain(
      'name="robots"',
    );
  });
});

describe('the ai-first outputs (R10)', () => {
  beforeAll(() => build({}, OUT), 120_000);

  const read = (p: string) => readFileSync(join(OUT, p), 'utf8');

  it('emits all three: HTML, markdown and llms.txt', () => {
    expect(existsSync(page('posts/published-example'))).toBe(true);
    expect(existsSync(join(OUT, 'posts/published-example/index.md'))).toBe(true);
    expect(existsSync(join(OUT, 'llms.txt'))).toBe(true);
  });

  it('gives every address a markdown twin, so negotiation cannot 404', () => {
    // The nginx index-file swap turns a missing twin into an agents-only 404.
    for (const dir of ['', 'posts/published-example', 'tag/homelab']) {
      expect(existsSync(join(OUT, dir, 'index.md')), `${dir || '/'} has no index.md`).toBe(true);
    }
  });

  it('serves the twins at direct addresses too', () => {
    expect(existsSync(join(OUT, 'posts/published-example.md'))).toBe(true);
    expect(existsSync(join(OUT, 'posts/published-example.json'))).toBe(true);
  });

  it('advertises markdown in the head for clients that do not negotiate', () => {
    expect(read('posts/published-example/index.html')).toContain('type="text/markdown"');
  });

  it('keeps the draft out of every machine-readable output', () => {
    expect(read('index.json')).not.toContain('draft-example');
    expect(read('llms.txt')).not.toContain('draft-example');
    expect(read('llms-full.txt')).not.toContain('draft-example');
    expect(existsSync(join(OUT, 'posts/draft-example.md'))).toBe(false);
    expect(existsSync(join(OUT, 'posts/draft-example.json'))).toBe(false);
  });
});

describe('the R10 gate', () => {
  beforeAll(() => build({}, OUT), 120_000);

  const check = (dir: string) => {
    try {
      execFileSync('node', ['scripts/check-outputs.ts', dir], { stdio: 'pipe' });
      return 0;
    } catch (error) {
      return (error as { status: number }).status;
    }
  };

  it('passes a complete build', () => {
    expect(check(OUT)).toBe(0);
  });

  it('fails a build that lost a markdown twin', () => {
    // The gate exists because this failure is invisible otherwise: the HTML
    // still serves, and only clients that asked for markdown get a 404.
    const victim = join(OUT, 'tag/homelab/index.md');
    const saved = readFileSync(victim, 'utf8');
    rmSync(victim);
    try {
      expect(check(OUT)).toBe(1);
    } finally {
      writeFileSync(victim, saved);
    }
  });
});

describe('the nginx template', () => {
  const conf = readFileSync('nginx/site.conf.example', 'utf8');

  it('sets Vary: Accept — without it a cache hands markdown to a browser', () => {
    expect(conf).toMatch(/add_header\s+Vary\s+Accept\s+always;/);
  });

  it('advertises llms.txt in a Link header on every response', () => {
    expect(conf).toContain('rel="alternate"');
    expect(conf).toContain('/llms.txt');
  });

  it('negotiates the index file on Accept', () => {
    expect(conf).toMatch(/map\s+\$http_accept\s+\$site_index/);
    expect(conf).toContain('index.md');
  });

  it('serves .md files as markdown rather than as the default type', () => {
    expect(conf).toMatch(/text\/markdown\s+md;/);
  });

  // The live assertions — that a real server actually returns markdown for
  // `Accept: text/markdown` and sets Vary on the response — need a running
  // nginx and belong to oh-my-portal-aa1, with the 301/200 redirect checks.
});

/**
 * Staging.
 *
 * Both halves asserted against real builds, for the same reason the draft rule
 * is: the risk is a page that forgets to opt in, and a unit test of the switch
 * cannot see that. The production half matters as much as the staging half —
 * a `Disallow: /` that leaked into production would take the whole site out of
 * search, silently, and look like nothing at all in a diff.
 */
const OUT_STAGING = 'dist-test-staging';

describe('a staging build', () => {
  beforeAll(() => build({ STAGING: '1' }, OUT_STAGING), 120_000);

  it('refuses every crawler in robots.txt', () => {
    const robots = readFileSync(join(OUT_STAGING, 'robots.txt'), 'utf8');
    expect(robots).toContain('Disallow: /');
    expect(robots).not.toContain('Allow: /');
  });

  it('advertises no sitemap — inviting a crawler in and turning it away is a contradiction', () => {
    expect(readFileSync(join(OUT_STAGING, 'robots.txt'), 'utf8')).not.toContain('Sitemap:');
  });

  it('puts noindex on every page, not only the ones that asked', () => {
    for (const path of ['index.html', 'posts/published-example/index.html', 'about/index.html']) {
      expect(readFileSync(join(OUT_STAGING, path), 'utf8'), path).toContain('name="robots"');
      expect(readFileSync(join(OUT_STAGING, path), 'utf8'), path).toContain('noindex, nofollow');
    }
  });

  it('says so where a human can see it, not only in the markup', () => {
    expect(readFileSync(join(OUT_STAGING, 'index.html'), 'utf8')).toContain('Репетиция переезда');
  });
});

describe('a production build is untouched by the staging switch', () => {
  it('still invites crawlers and advertises the sitemap', () => {
    const robots = readFileSync(join(OUT, 'robots.txt'), 'utf8');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap:');
    expect(robots).not.toMatch(/^Disallow: \/$/m);
  });

  it('carries no noindex on an ordinary article and no rehearsal banner', () => {
    const article = readFileSync(page('posts/published-example'), 'utf8');
    expect(article).not.toContain('name="robots"');
    expect(article).not.toContain('Репетиция переезда');
  });
});
