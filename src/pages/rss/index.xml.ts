import rss from '@astrojs/rss';
import type { APIContext } from 'astro';

import { listPosts } from '../../posts.ts';

/**
 * The main feed — R2.
 *
 * The address is `/rss/`, the one the old site served, and it is the single
 * exemption from the redirect map: feed readers handle a moved feed unreliably
 * and some drop the subscription without telling anyone.
 *
 * Astro writes this to `rss/index.xml`; the nginx server block maps `/rss/` onto
 * it with the feed content type (see `nginx/site.conf.example`). That indirection
 * is the price of keeping an address that is not a `.xml` file.
 */
export async function GET(context: APIContext) {
  const posts = await listPosts();

  return rss({
    title: 'Записи',
    description: 'Записи о домашней инфраструктуре, инструментах и агентах.',
    // Set from SITE_URL at build time; `site` is configured, so this is defined.
    site: context.site!,
    trailingSlash: true,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.summary,
      pubDate: post.data.date,
      link: `/posts/${post.id}/`,
      categories: post.data.tags,
      // Design §8: the reader is never in doubt about who wrote what, and a
      // feed reader shows the author field.
      author: post.data.author,
    })),
    customData: `<language>ru</language>`,
  });
}
