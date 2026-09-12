import { XMLParser } from 'fast-xml-parser';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { build } from './helpers.ts';

/**
 * R3–R8: the contact surface. Every assertion here is about something a reader
 * arriving from search needs and the old site did not offer.
 */
const OUT = 'dist-test-pages';
const read = (path: string) => readFileSync(join(OUT, path), 'utf8');

describe('the workshop and changes of mind', () => {
  it('publishes the same dated correction in HTML and both machine twins', () => {
    for (const path of ['index.html', 'posts/published-example/index.html', 'posts/published-example.md', 'posts/published-example.json']) {
      expect(read(path)).toContain('Нужно дождаться готовности туннеля.');
      expect(read(path)).toContain('2026-02-03');
    }
    expect(read('posts/published-example/index.html')).toContain('Тело опубликованной записи');
  });
  it('keeps a complete archive with a Markdown twin and no drafts', () => {
    expect(read('index.html')).toContain('href="/archive/"');
    for (const path of ['archive/index.html', 'archive/index.md']) {
      expect(read(path)).toContain('published-example');
      expect(read(path)).not.toContain('draft-example');
    }
  });
  it('links the project trail to a real post', () => {
    expect(read('projects/index.html')).toContain('История эксперимента');
    expect(read('projects/index.html')).toContain('/posts/published-example/');
    expect(read('projects/index.md')).toContain('Прототип (done): /posts/published-example/');
  });
});

beforeAll(() => build({}, OUT), 180_000);

describe('R3: a way to make contact, from any page', () => {
  it('is in the footer of every page, not only on /about/', () => {
    for (const page of ['index.html', 'posts/published-example/index.html', 'tag/homelab/index.html']) {
      expect(read(page), page).toContain('mailto:test@example.invalid');
    }
  });
});

describe('Shared UI shell', () => {
  it('uses one frame and an attributed footer on every page type', () => {
    for (const route of ['index.html', 'projects/index.html', 'about/index.html', 'archive/index.html', 'search/index.html', 'tag/homelab/index.html', 'posts/published-example/index.html']) {
      const html = read(route);
      expect(html).toMatch(/<main[^>]*class="frame"/);
      const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0];
      expect(footer, route).toContain('Тестовый Автор');
      expect(footer, route).toContain(`© ${new Date().getUTCFullYear()}`);
      expect(footer, route).toContain('href="/about/"');
      expect(footer, route).toContain('href="/rss/index.xml"');
      expect(footer, route).toContain('mailto:test@example.invalid');
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

  it('shows the portrait from the content images, sized so the layout does not jump', () => {
    const img = portrait(article());
    expect(img).toMatch(/width="\d+"/);
    expect(img).toMatch(/height="\d+"/);
    // The name is printed right beside it; announcing it twice is noise.
    expect(img).toContain('alt=""');
  });
});

/** The author's portrait tag, or an empty string when the page has none. */
const portrait = (html: string) => html.match(/<img[^>]*\/images\/test-author\/avatar\.webp[^>]*>/)?.[0] ?? '';

describe('the masthead and the mottos', () => {
  const header = (html: string) => html.match(/<header[^>]*site-header[\s\S]*?<\/header>/)?.[0] ?? '';

  it('calls the about page one thing in the header, the footer and its markdown twin', () => {
    const html = read('archive/index.html');
    const labels = (region: string) =>
      [...region.matchAll(/<a[^>]*href="\/about\/"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]!.trim());
    expect(labels(header(html))).toEqual(['обо мне']);
    expect(labels(html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '')).toContain('обо мне');
    expect(read('about/index.md')).toMatch(/^# Обо мне/m);
  });

  it('marks the section a page belongs to, and none on the homepage', () => {
    const current = (html: string) =>
      [...header(html).matchAll(/<a[^>]*href="([^"]+)"[^>]*aria-current="page"/g)].map((m) => m[1]);
    expect(current(read('about/index.html'))).toEqual(['/about/']);
    expect(current(read('posts/published-example/index.html'))).toEqual(['/archive/']);
    expect(current(read('index.html'))).toEqual([]);
  });

  it('names the site rather than the author, with its icon beside the name', () => {
    const html = header(read('about/index.html'));
    expect(html).toContain('Тестовый Журнал');
    expect(html).not.toContain('Тестовый Автор');
    expect(html).toMatch(/<img[^>]*\/images\/test-author\/icon\.svg[^>]*alt=""/);
  });

  it('prints the first motto without JavaScript and hands the page every one', () => {
    const home = read('index.html');
    const h1 = home.match(/<h1[^>]*data-typed-headline[\s\S]*?<\/h1>/)?.[0] ?? '';
    expect(h1).toMatch(/class="sr-only"[^>]*>Первый(\s|&nbsp;)+девиз/);
    expect(h1).toMatch(/Второй(\s|&nbsp;)+девиз/);
  });
});

describe('a project illustration from the content repository', () => {
  const picture = /<img[^>]*src="\/images\/test-author\/sketch\.svg"[^>]*>/;

  it('shows on /projects/ with its handwritten notes', () => {
    const html = read('projects/index.html');
    expect(html).toMatch(picture);
    expect(html).toContain('Заметка на полях');
  });

  it('shows beside the project featured on the homepage', () => {
    expect(read('index.html')).toMatch(picture);
  });
});

describe('the homepage greeting', () => {
  it('prints the intro under the motto, and keeps the bio at the end of articles', () => {
    const intro = read('index.html').match(/<p class="intro-text"[^>]*>([^<]*)<\/p>/)?.[1];
    expect(intro).toBe('Привет, это тестовое приветствие главной.');
    const article = read('posts/published-example/index.html');
    expect(article).toContain('Строка для проверки авторского блока.');
    expect(article).not.toContain('тестовое приветствие');
  });
});

describe('external links open in a new tab', () => {
  const article = () => read('posts/published-example/index.html');
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const anchor = (html: string, href: string) => html.match(new RegExp(`<a[^>]*href="${escape(href)}"[^>]*>`))?.[0] ?? '';

  it('in the body of an article', () => {
    const a = anchor(article(), 'https://example.org/external');
    expect(a).toContain('target="_blank"');
    expect(a).toMatch(/rel="[^"]*noopener/);
  });

  it('in the author block, keeping rel="me"', () => {
    const a = anchor(article(), 'https://github.com/example/test');
    expect(a).toContain('target="_blank"');
    expect(a).toMatch(/rel="[^"]*\bme\b/);
    expect(a).toMatch(/rel="[^"]*noopener/);
  });

  it('but not for mail, and not for addresses on the site itself', () => {
    expect(anchor(article(), 'mailto:test@example.invalid')).not.toBe('');
    expect(anchor(article(), 'mailto:test@example.invalid')).not.toContain('target=');
    expect(anchor(article(), '/archive/')).not.toContain('target=');
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

  it('puts the portrait on /about/, where a reader goes to see who wrote this', () => {
    expect(portrait(read('about/index.html'))).not.toBe('');
  });

  it('shows the QR code of a link on /about/, and only there', () => {
    const qr = /<img[^>]*\/images\/test-author\/qr\.svg[^>]*>/;
    expect(read('about/index.html')).toMatch(qr);
    // At the end of every article it would be the heaviest mark on the page,
    // for the rare reader who wants to write rather than read on.
    expect(read('posts/published-example/index.html')).not.toMatch(qr);
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

describe('a page for each project', () => {
  const page = () => read('projects/live-thing/index.html');

  it('shows the project, its stages, its own text and the posts about it', () => {
    const html = page();
    for (const text of ['Живой проект', 'в работе', 'Проверяет активное состояние.', 'История эксперимента', 'Тело страницы живого проекта.', 'Записи о проекте', 'Исходники']) {
      expect(html, text).toContain(text);
    }
    expect(html).toContain('href="/posts/published-example/"');
    expect(html).toMatch(/<img[^>]*src="\/images\/test-author\/sketch\.svg"/);
  });

  it('leaves the posts block out when nothing is written about the project', () => {
    expect(read('projects/dead-thing/index.html')).not.toContain('Записи о проекте');
  });

  it('has both markdown twins, the same bytes, with the body and the posts', () => {
    const md = read('projects/live-thing/index.md');
    expect(read('projects/live-thing.md')).toBe(md);
    expect(md).toMatch(/^# Живой проект/);
    expect(md).toContain('`active`');
    expect(md).toContain('Тело страницы живого проекта.');
    expect(md).toContain('https://journal.example.test/posts/published-example.md');
  });

  it('builds no page for a draft project', () => {
    expect(existsSync(join(OUT, 'projects/draft-thing/index.html'))).toBe(false);
  });
});

describe('a project and what points at it', () => {
  it('links each card on /projects/ to its page, keeping the anchor', () => {
    const html = read('projects/index.html');
    expect(html).toMatch(/<h2[^>]*><a[^>]*href="\/projects\/live-thing\/"[^>]*>Живой проект<\/a><\/h2>/);
    expect(html).toMatch(/<a[^>]*href="\/projects\/live-thing\/"[^>]*>Страница проекта<\/a>/);
    expect(html).toContain('id="live-thing"');
  });

  it('sends the homepage feature to the project page and labels its question', () => {
    const feature = read('index.html').match(/<section[^>]*class="[^"]*\bfeature\b[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(feature).toContain('href="/projects/live-thing/"');
    expect(feature).not.toContain('/projects/#');
    expect(feature).toContain('Открытый вопрос');
    expect(feature).toContain('Что проверяет живой проект?');
  });

  it('links a post back to each of its projects', () => {
    const html = read('posts/published-example/index.html');
    expect(html).toMatch(/<a[^>]*href="\/projects\/live-thing\/"[^>]*>Живой проект<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/projects\/sibling-thing\/"[^>]*>Соседний проект<\/a>/);
  });

  it('lists the post on each project it names', () => {
    expect(read('projects/sibling-thing/index.html')).toContain('href="/posts/published-example/"');
  });

  it('carries the projects into the machine versions', () => {
    const urls = ['https://journal.example.test/projects/live-thing/', 'https://journal.example.test/projects/sibling-thing/'];
    expect(read('posts/published-example.md')).toContain(`projects:\n  - ${urls[0]}\n  - ${urls[1]}\n`);
    expect(JSON.parse(read('posts/published-example.json')).projects).toEqual(urls);
    expect(JSON.parse(read('index.json')).posts.find((p: { slug: string }) => p.slug === 'published-example').projects).toEqual(urls);
    expect(read('llms.txt')).toContain('## Проекты');
    expect(read('llms.txt')).toContain('https://journal.example.test/projects/live-thing.md');
    expect(read('projects/index.md')).toContain(`## [Живой проект](${urls[0]})`);
  });
});

describe('page jump: targets no heading can take', () => {
  const article = () => read('posts/published-example/index.html');
  const count = (html: string, id: string) => html.split(`id="${id}"`).length - 1;

  it('puts ↑ on the site header and ↓ on the neighbours block', () => {
    const html = article();
    expect(html).toMatch(/<header(?=[^>]*\bsite-header\b)(?=[^>]*\bid="page:top")[^>]*>/);
    expect(html).toMatch(/<nav(?=[^>]*\bafter-nav\b)(?=[^>]*\bid="page:end")[^>]*>/);
  });

  /*
   * The fixture has headings literally called "page:top" and "page:end". The
   * heading slugger strips ":", so they get other ids and each target stays
   * unique. If an Astro or github-slugger upgrade starts keeping the colon, this
   * fails before a heading can capture a jump on a real article.
   */
  it('keeps each target unique when headings are named after them', () => {
    const html = article();
    expect(html).toMatch(/<h2[^>]*>page:top<\/h2>/);
    expect(html).toMatch(/<h2[^>]*>page:end<\/h2>/);
    expect(count(html, 'page:top')).toBe(1);
    expect(count(html, 'page:end')).toBe(1);
  });
});

describe('page jump: the control', () => {
  const block = (html: string) => html.match(/<nav(?=[^>]*\bpage-jump\b)[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';

  it('ships hidden on an article, out of the search index, linking to both targets', () => {
    const nav = block(read('posts/published-example/index.html'));
    const open = nav.match(/^<nav[^>]*>/)?.[0] ?? '';
    // Hidden until the script can tell when each control is useful.
    expect(open).toMatch(/\shidden(\s|>|=)/);
    expect(open).toContain('data-pagefind-ignore');
    expect(open).toContain('aria-label="по статье"');
    expect(nav).toMatch(/<a[^>]*href="#page:top"[^>]*aria-label="наверх"/);
    expect(nav).toMatch(/<a[^>]*href="#page:end"[^>]*aria-label="в конец статьи"/);
  });

  it('is on articles only', () => {
    for (const page of ['index.html', 'archive/index.html', 'projects/index.html', 'projects/live-thing/index.html']) {
      expect(block(read(page)), page).toBe('');
    }
  });
});
