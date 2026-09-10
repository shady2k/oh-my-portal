import type { APIContext } from 'astro';

import { listPosts, listTags } from '../posts.ts';
import { sitemapPaths } from '../seo.ts';

/**
 * `/sitemap.xml`.
 *
 * Hand-rolled rather than `@astrojs/sitemap`, for one reason: the plugin
 * enumerates routes and knows nothing about `noindex`, so it would list
 * `/search/` — a page that carries `noindex` precisely because arriving at a
 * search box from a search engine helps nobody. Contradicting yourself in two
 * files is worse than writing twelve lines.
 *
 * The cost of hand-rolling is drift — a new route that nobody adds here. That
 * is paid for in `test/sitemap.test.ts`, which walks a real build and asserts
 * this list and the built addresses are the same set, so the drift fails the
 * build instead of quietly shrinking the site's index.
 *
 * `lastmod` is the article's own `updated`, falling back to its date. It is
 * omitted entirely for listings: a crawler treats a `lastmod` it can prove
 * wrong as a reason to trust none of them, and this build has nothing truthful
 * to say about when `/about/` last changed.
 */
export async function GET({ site }: APIContext) {
  const posts = await listPosts();
  const tags = (await listTags()).map(({ tag }) => tag);

  const changed = new Map(
    posts.map((post) => [`/posts/${post.id}/`, (post.data.updated ?? post.data.date).toISOString()]),
  );

  const entries = sitemapPaths(
    posts.map((post) => post.id),
    tags,
  ).map((path) => {
    const url = new URL(path, site!).href;
    const lastmod = changed.get(path);
    return `  <url>\n    <loc>${url}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
