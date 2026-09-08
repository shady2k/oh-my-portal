import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The routes and the draft rule, asserted against a real build rather than
 * against the helpers that produce it — a page that forgets to filter drafts
 * still passes a unit test of the filter.
 */
const OUT = 'dist-test';
const page = (path: string) => join(OUT, path, 'index.html');

const build = (env: Record<string, string>) => {
  rmSync(OUT, { recursive: true, force: true });
  execFileSync('npx', ['astro', 'build', '--outDir', OUT], {
    env: { ...process.env, CONTENT_DIR: 'test/fixtures/posts', ...env },
    stdio: 'pipe',
  });
};

describe('a production build', () => {
  beforeAll(() => build({}), 120_000);

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
  beforeAll(() => build({ PREVIEW: '1' }), 120_000);

  it('shows the draft, because that is what a preview is for (design §7)', () => {
    expect(existsSync(page('posts/draft-example'))).toBe(true);
  });

  it('marks it noindex, so a preview host cannot leak into search', () => {
    expect(readFileSync(page('posts/draft-example'), 'utf8')).toContain('name="robots"');
  });
});
