import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The routes and the draft rule, asserted against a real build rather than
 * against the helpers that produce it — a page that forgets to filter drafts
 * still passes a unit test of the filter.
 */
const OUT = 'dist-test';
const OUT_PREVIEW = 'dist-test-preview';
const page = (path: string, out = OUT) => join(out, path, 'index.html');

/**
 * Each build gets its own directory. Sharing one made a later describe's
 * beforeAll overwrite what an earlier describe was asserting against, which is
 * a test that passes or fails on file order rather than on behaviour.
 */
const build = (env: Record<string, string>, out = OUT) => {
  rmSync(out, { recursive: true, force: true });
  execFileSync('npx', ['astro', 'build', '--outDir', out], {
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
  beforeAll(() => build({}), 120_000);

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
  beforeAll(() => build({}), 120_000);

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
