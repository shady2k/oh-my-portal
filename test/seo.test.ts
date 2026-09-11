import { describe, expect, it } from 'vitest';

import { ogLocale, pageTitle, siteName, structuredData } from '../src/seo.ts';

const SITE = new URL('https://journal.example.test/');
const at = (path: string) => new URL(path, SITE);

describe('the site name', () => {
  it('comes from the content repository', () => {
    expect(siteName({ name: 'Имя', bio: 'x', contact: { label: 'a', href: 'b' }, links: [] })).toBe(
      'Имя',
    );
  });

  it('prefers a site name to the author name when the content repository sets one', () => {
    expect(
      siteName({ name: 'Имя', site_name: 'журнал', bio: 'x', contact: { label: 'a', href: 'b' }, links: [] }),
    ).toBe('журнал');
  });

  it('falls back to the genre, never to a placeholder person', () => {
    expect(siteName(undefined)).toBe('Полевой журнал');
  });
});

describe('the title', () => {
  it('leads with the page and ends with the site', () => {
    expect(pageTitle('Проекты', 'Полевой журнал')).toBe('Проекты — Полевой журнал');
  });

  it('does not repeat the site name when the page is the site', () => {
    expect(pageTitle('Полевой журнал', 'Полевой журнал')).toBe('Полевой журнал');
  });

  it('follows the site name with the headline on the homepage', () => {
    expect(pageTitle('Полевой журнал', 'Полевой журнал', 'Идеи, которые стали опытом')).toBe(
      'Полевой журнал — Идеи, которые стали опытом',
    );
  });
});

describe('og:locale', () => {
  it('regionalises a bare tag the conventional way', () => {
    expect(ogLocale('ru')).toBe('ru_RU');
  });

  it('knows English is the exception', () => {
    expect(ogLocale('en')).toBe('en_US');
  });

  it('keeps a region it was given', () => {
    expect(ogLocale('pt-BR')).toBe('pt_BR');
  });
});

describe('structured data for an article', () => {
  const article = {
    title: 'Обратный прокси за WireGuard',
    description: 'Один сервис наружу, ни одного порта на роутере.',
    canonical: at('/posts/reverse-proxy/'),
    site: SITE,
    siteName: 'Полевой журнал',
    lang: 'ru',
    authorName: 'Имя',
  };

  it('emits one BlogPosting with the frontmatter facts', () => {
    const [post] = structuredData({
      ...article,
      article: { published: new Date('2026-01-02'), tags: ['homelab'], byHuman: true },
    });
    expect(post!['@type']).toBe('BlogPosting');
    expect(post!.datePublished).toBe('2026-01-02T00:00:00.000Z');
    expect(post!.keywords).toBe('homelab');
    expect(post!.inLanguage).toBe('ru');
    expect(post!.author).toMatchObject({ '@type': 'Person', name: 'Имя' });
  });

  it('omits dateModified when the post was never updated', () => {
    const [post] = structuredData({
      ...article,
      article: { published: new Date('2026-01-02'), tags: [], byHuman: true },
    });
    expect(post).not.toHaveProperty('dateModified');
  });

  it('carries dateModified when it was', () => {
    const [post] = structuredData({
      ...article,
      article: {
        published: new Date('2026-01-02'),
        modified: new Date('2026-03-04'),
        tags: [],
        byHuman: true,
      },
    });
    expect(post!.dateModified).toBe('2026-03-04T00:00:00.000Z');
  });

  /*
   * §8 in machine-readable form. An article the inhabitant wrote must not be
   * attributable to the maintainer, and JSON-LD is the one place that would be
   * read by a machine and believed without anyone looking at the page.
   */
  it('gives an article by the being no author at all', () => {
    const [post] = structuredData({
      ...article,
      article: { published: new Date('2026-01-02'), tags: [], byHuman: false },
    });
    expect(post).not.toHaveProperty('author');
  });

  it('trails Главная → Журнал → the article', () => {
    const blocks = structuredData({
      ...article,
      article: { published: new Date('2026-01-02'), tags: [], byHuman: true },
    });
    const trail = blocks.find((block) => block['@type'] === 'BreadcrumbList');
    expect(
      (trail!.itemListElement as { name: string }[]).map((crumb) => crumb.name),
    ).toEqual(['Главная', 'Журнал', 'Обратный прокси за WireGuard']);
  });
});

describe('structured data elsewhere', () => {
  const page = {
    description: 'Записи о домашней инфраструктуре.',
    site: SITE,
    siteName: 'Полевой журнал',
    lang: 'ru',
  };

  it('describes the homepage as a WebSite and its author as a Person', () => {
    const types = structuredData({
      ...page,
      title: 'Полевой журнал',
      canonical: at('/'),
      authorName: 'Имя',
    }).map((block) => block['@type']);
    expect(types).toContain('WebSite');
    expect(types).toContain('Person');
  });

  /* The engine builds with no content repository mounted (§2). A Person block
     naming nobody is worse than no Person block. */
  it('names no Person when no author is available', () => {
    const types = structuredData({ ...page, title: 'Полевой журнал', canonical: at('/') }).map(
      (block) => block['@type'],
    );
    expect(types).toContain('WebSite');
    expect(types).not.toContain('Person');
  });

  it('gives the homepage no breadcrumb, having nowhere to come from', () => {
    const types = structuredData({ ...page, title: 'Полевой журнал', canonical: at('/') }).map(
      (block) => block['@type'],
    );
    expect(types).not.toContain('BreadcrumbList');
  });

  it('hangs a provenance page off its article, not off the journal', () => {
    const blocks = structuredData({ ...page, title: 'Статья', canonical: at('/posts/x/integrity/') });
    const trail = blocks.find((block) => block['@type'] === 'BreadcrumbList');
    expect((trail!.itemListElement as { item: string }[]).map((crumb) => crumb.item)).toEqual([
      'https://journal.example.test/',
      'https://journal.example.test/archive/',
      'https://journal.example.test/posts/x/',
      'https://journal.example.test/posts/x/integrity/',
    ]);
  });
});
