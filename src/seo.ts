import type { Author } from './schema/site.ts';

/**
 * What the head says about a page — design §5.
 *
 * Pure functions, no Astro imports: the composition rules below are the kind of
 * thing that is easy to get subtly wrong and impossible to eyeball in a built
 * page, so they are unit-testable on their own. `Base.astro` renders what these
 * return and decides nothing itself.
 */

/**
 * The site's name.
 *
 * It comes from the content repository (§2), so this repository never knows it
 * at author time. The fallback is the journal's genre rather than a person's
 * name — a placeholder name is the one thing a public engine must not ship.
 *
 * A site name of its own wins over the author's: the full name still signs the
 * articles, the footer and the structured data, and does not need to head every
 * page as well.
 */
export const siteName = (author?: Author) => author?.site_name ?? author?.name ?? 'Полевой журнал';

/**
 * `<title>`: the page first, the site last.
 *
 * A search result and a browser tab both truncate from the right, so the words
 * that tell one page from another go where they survive and the site's name is
 * the part a reader can afford to lose. Every page had only the first half of
 * this before, which left `Поиск` and `Проекты` indistinguishable from those of
 * any other site in existence.
 *
 * The homepage inverts it, because there the site *is* the subject: it leads
 * with the name and follows with the headline. Titling it `Записи` named a
 * section rather than a journal, and contradicted the page's own `<h1>`.
 */
export function pageTitle(title: string, site: string, tagline?: string): string {
  if (tagline) return `${title} — ${tagline}`;
  return title === site ? title : `${title} — ${site}`;
}

/**
 * `og:locale` wants `xx_YY`, and `lang` is BCP 47 (§4), which may be `ru` or
 * `pt-BR`. A region-less tag has no correct answer, only a conventional one:
 * for most languages repeating the subtag is what everyone writes, and English
 * is the exception that proves it — `en_EN` is not a locale anyone recognises.
 */
const LOCALE: Record<string, string> = { en: 'en_US' };

export function ogLocale(lang: string): string {
  if (lang.includes('-')) return lang.replace('-', '_');
  return LOCALE[lang] ?? `${lang}_${lang.toUpperCase()}`;
}

/** Everything an article contributes to the head, straight from its frontmatter. */
export interface ArticleMeta {
  published: Date;
  modified?: Date;
  tags: string[];
  /**
   * §8: `being` is a disclosure, not a byline that may be reassigned. An
   * article the inhabitant wrote must never carry the maintainer's name in
   * machine-readable metadata — that is the exact substitution §8 exists to
   * prevent — and the engine has no name for the inhabitant to put there
   * instead, so such an article carries no author at all. Omission is honest;
   * the wrong name is not.
   */
  byHuman: boolean;
}

const iso = (date: Date) => date.toISOString();

interface LdInput {
  title: string;
  description: string;
  canonical: URL;
  site: URL;
  siteName: string;
  lang: string;
  authorName?: string;
  article?: ArticleMeta;
}

/**
 * The structured data for a page, as objects — one `<script>` per entry.
 *
 * Every field here already exists in the frontmatter or the site data and
 * already reaches `/posts/<slug>.md` and `/index.json`, which no search engine
 * reads. This is the same facts in the one format they do parse; nothing is
 * invented, and a fact that is absent stays absent rather than acquiring a
 * placeholder.
 */
export function structuredData(input: LdInput): Record<string, unknown>[] {
  const { title, description, canonical, site, siteName, lang, authorName, article } = input;
  const person = authorName ? { '@type': 'Person', name: authorName, url: site.href } : undefined;
  const blocks: Record<string, unknown>[] = [];

  if (article) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: title,
      description,
      datePublished: iso(article.published),
      ...(article.modified ? { dateModified: iso(article.modified) } : {}),
      ...(article.byHuman && person ? { author: person } : {}),
      ...(article.tags.length ? { keywords: article.tags.join(', ') } : {}),
      inLanguage: lang,
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical.href },
      isPartOf: { '@type': 'Blog', name: siteName, url: site.href },
    });
  } else if (canonical.pathname === '/') {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteName,
      description,
      url: site.href,
      inLanguage: lang,
      ...(person ? { publisher: person } : {}),
    });
    if (person) blocks.push({ '@context': 'https://schema.org', ...person });
  }

  const trail = breadcrumb(canonical, title);
  if (trail.length > 1) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: trail.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: new URL(crumb.path, site).href,
      })),
    });
  }

  return blocks;
}

/**
 * The trail to a page, derived from its address rather than passed down.
 *
 * The address space is small and flat (§5), so a path is enough to know where a
 * page sits, and deriving it here means a new route cannot ship with a
 * breadcrumb that disagrees with its own URL.
 */
function breadcrumb(canonical: URL, title: string): { name: string; path: string }[] {
  const path = canonical.pathname;
  const home = { name: 'Главная', path: '/' };
  const journal = { name: 'Журнал', path: '/archive/' };

  if (path.startsWith('/posts/')) {
    /* `/posts/<slug>/integrity/` hangs off the article, not off the journal. */
    const slug = path.split('/')[2];
    const article = { name: title, path: `/posts/${slug}/` };
    return path.endsWith('/integrity/')
      ? [home, journal, article, { name: 'Провенанс', path }]
      : [home, journal, article];
  }
  if (path.startsWith('/tag/')) return [home, journal, { name: title, path }];
  if (path === '/') return [home];
  return [home, { name: title, path }];
}

/**
 * Every address a crawler should know about, as paths.
 *
 * Deliberately built from the same functions the pages are built from, so a
 * post that is not published cannot appear here: `listPosts()` already applies
 * the draft rule (§4), and this cannot be handed a draft without the listings
 * having leaked one first.
 *
 * `/search/`, the 404 and `/posts/<slug>/integrity/` are absent for the same
 * reason they carry `noindex`: a search box is not a page anyone should arrive
 * at from a search engine, and a provenance page is a thing you check about an
 * article you are already reading, not a landing page. Asking not to be indexed
 * and then submitting the address is a contradiction a crawler resolves against
 * the site.
 */
export function sitemapPaths(slugs: string[], tags: string[]): string[] {
  return [
    '/',
    '/archive/',
    '/about/',
    '/projects/',
    ...slugs.map((slug) => `/posts/${slug}/`),
    ...tags.map((tag) => `/tag/${tag}/`),
  ];
}
