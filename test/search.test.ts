import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { build, search, serve } from './helpers.ts';

/**
 * Search is exercised through the real Pagefind engine against a real build.
 * Asserting on the index files instead would have passed while `caddy` and
 * `2.9.1` returned nothing.
 */
const OUT = 'dist-test-search';

let find: (q: string) => Promise<{ url: string }[]>;
let server: { origin: string; close: () => Promise<void> };

beforeAll(async () => {
  build({}, OUT);
  server = await serve(OUT);
  find = await search(OUT, server.origin);
}, 180_000);

afterAll(() => server?.close());

const slugs = async (query: string) =>
  (await find(query)).map((hit) => new URL(hit.url, server.origin).pathname);

describe('what readers actually type', () => {
  it('finds an article by an exact tool name', async () => {
    // Section 7 chose Pagefind for exactly this query shape.
    expect(await slugs('wireguard')).toContain('/posts/published-example/');
  });

  it('finds an article by a version string', async () => {
    expect(await slugs('2.9.1')).toContain('/posts/published-example/');
  });

  it('finds an article by a Russian word from its prose', async () => {
    expect(await slugs('туннель')).toContain('/posts/published-example/');
  });

  it('returns nothing rather than everything for a word nobody wrote', async () => {
    expect(await slugs('kubernetes')).toHaveLength(0);
  });
});

describe('what the index must not contain', () => {
  it('leaves out drafts', async () => {
    expect(await slugs('черновик')).toHaveLength(0);
    expect(await slugs('draft-example')).toHaveLength(0);
  });

  it('indexes articles only, not listings or the search page itself', async () => {
    const entry = JSON.parse(readFileSync(`${OUT}/pagefind/pagefind-entry.json`, 'utf8'));
    // One published fixture article. Index, tag pages and /search/ carry no
    // data-pagefind-body, so Pagefind excludes them.
    expect(entry.languages.ru.page_count).toBe(1);
  });

  it('leaves out the utility field labels', async () => {
    expect(await slugs('обновлено')).toHaveLength(0);
  });
});

describe('the page itself', () => {
  const html = () => readFileSync(`${OUT}/search/index.html`, 'utf8');

  it('says so instead of showing a box that does nothing, without JavaScript', () => {
    // The form ships hidden and the script reveals it; the fallback ships visible.
    expect(html()).toMatch(/<form[^>]*hidden/);
    expect(html()).toContain('Поиск требует JavaScript');
  });

  it('stays out of search engines — it is not content', () => {
    expect(html()).toContain('name="robots"');
  });

  it('has a markdown twin that points an agent somewhere better', () => {
    const md = readFileSync(`${OUT}/search/index.md`, 'utf8');
    expect(md).toContain('/index.json');
    expect(md).toContain('/llms.txt');
  });
});
