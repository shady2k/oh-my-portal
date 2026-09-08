import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { build } from './helpers.ts';

/**
 * R3–R8: the contact surface. Every assertion here is about something a reader
 * arriving from search needs and the old site did not offer.
 */
const OUT = 'dist-test-pages';
const read = (path: string) => readFileSync(join(OUT, path), 'utf8');

beforeAll(() => build({}, OUT), 180_000);

describe('R3: a way to make contact, from any page', () => {
  it('is in the status line of every page, not only on /about/', () => {
    for (const page of ['index.html', 'posts/published-example/index.html', 'tag/homelab/index.html']) {
      expect(read(page), page).toContain('mailto:test@example.invalid');
    }
  });
});

describe('R4, R5: the author block at the end of an article', () => {
  const article = () => read('posts/published-example/index.html');

  it('names the author and says what they do', () => {
    expect(article()).toContain('Тестовый Автор');
    expect(article()).toContain('Строка для проверки авторского блока.');
  });

  it('carries GitHub, which the old site never mentioned anywhere', () => {
    expect(article()).toContain('https://github.com/example/test');
  });

  it('sits after the article rather than before it', () => {
    const html = article();
    expect(html.indexOf('Тело опубликованной записи')).toBeLessThan(html.indexOf('Строка для проверки'));
  });

  it('stays out of the search index — it is furniture on every page', () => {
    expect(article()).toMatch(/data-pagefind-ignore/);
  });
});

describe('R7: sharing where the audience actually is', () => {
  const article = () => read('posts/published-example/index.html');

  it('offers Telegram and VK', () => {
    expect(article()).toContain('t.me/share/url');
    expect(article()).toContain('vk.com/share.php');
  });

  it('offers neither Twitter nor Facebook', () => {
    expect(article()).not.toMatch(/twitter\.com|x\.com\/intent|facebook\.com/);
  });

  it('loads nothing from a third party — the buttons are links', () => {
    expect(article()).not.toMatch(/<script[^>]+src="https?:\/\/(?!localhost)/);
  });
});

describe('R6: subscription', () => {
  it('posts to the address the content repository configured', () => {
    expect(read('posts/published-example/index.html')).toContain('action="/subscribe/"');
  });

  it('is on /about/ too, where someone who read about the author ends up', () => {
    expect(read('about/index.html')).toContain('action="/subscribe/"');
  });

  it('gives every tag in use its own feed', () => {
    for (const tag of ['homelab']) {
      const feed = read(`feeds/${tag}.xml`);
      expect(feed).toContain('published-example');
      expect(feed).not.toContain('draft-example');
    }
  });

  it('advertises the narrower feed on the tag page', () => {
    expect(read('tag/homelab/index.html')).toContain('/feeds/homelab.xml');
  });
});

describe('R8: /about/ and /projects/', () => {
  it('serves /about/ at the address /aboutme/ redirects to', () => {
    expect(read('about/index.html')).toContain('Тестовый Автор');
  });

  it('lists projects with a state rather than as links', () => {
    const html = read('projects/index.html');
    expect(html).toContain('Живой проект');
    expect(html).toContain('в работе');
    expect(html).toContain('в архиве');
  });

  it('puts archived projects last, because an archive is a footnote', () => {
    const html = read('projects/index.html');
    expect(html.indexOf('Живой проект')).toBeLessThan(html.indexOf('Мёртвый проект'));
  });

  it('gives both pages a markdown twin', () => {
    expect(read('about/index.md')).toContain('mailto:test@example.invalid');
    // The state travels into the machine version: an agent should be able to say
    // a project is archived rather than guessing from a commit date.
    expect(read('projects/index.md')).toContain('`archived`');
  });
});

describe('pages are not articles', () => {
  it('keeps /about/ and /projects/ out of the article listing and the feed', () => {
    expect(read('index.html')).not.toContain('/posts/about/');
    expect(read('rss/index.xml')).not.toContain('/posts/about/');
  });
});

describe('the feeds are well-formed RSS, not just files', () => {
  const parser = new XMLParser({ ignoreAttributes: false });

  const channel = (path: string) => {
    const parsed = parser.parse(read(path)) as {
      rss?: { '@_version'?: string; channel?: Record<string, unknown> };
    };
    expect(parsed.rss, `${path} has no <rss> root`).toBeDefined();
    expect(parsed.rss!['@_version']).toBe('2.0');
    return parsed.rss!.channel as Record<string, unknown>;
  };

  it('parses, with the elements RSS 2.0 requires', () => {
    for (const path of ['rss/index.xml', 'feeds/homelab.xml']) {
      const ch = channel(path);
      for (const field of ['title', 'link', 'description']) {
        expect(ch[field], `${path} has no <${field}>`).toBeTruthy();
      }
    }
  });

  it('gives every item a title and a link', () => {
    const ch = channel('rss/index.xml');
    const items = ([] as Record<string, unknown>[]).concat(
      ch.item as Record<string, unknown>[] | Record<string, unknown>,
    );
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.title).toBeTruthy();
      expect(String(item.link)).toMatch(/^https?:\/\//);
    }
  });

  it('declares its language, so a reader knows what it is subscribing to', () => {
    expect(channel('rss/index.xml').language).toBe('ru');
  });
});
