import rss from '@astrojs/rss';
import type { APIContext } from 'astro';

import { listPosts, listTags, type Post } from '../../posts.ts';

/**
 * `/feeds/<tag>.xml` — per-topic subscription (R6, §6).
 *
 * The main feed at `/rss/` carries everything; someone who only wants the
 * Kubernetes posts should not have to filter by hand or unsubscribe. Only tags
 * actually in use get a feed, for the same reason only they get a page.
 *
 * `/rss/` keeps its address by R2; these are new, so they take the shape the
 * rest of the site uses.
 */
export async function getStaticPaths() {
  const posts = await listPosts();
  const tags = await listTags();
  return tags.map(({ tag }) => ({
    params: { tag },
    props: { tag, posts: posts.filter((p) => p.data.tags.includes(tag)) },
  }));
}

export function GET(context: APIContext & { props: { tag: string; posts: Post[] } }) {
  const { tag, posts } = context.props;
  return rss({
    title: `Записи: ${tag}`,
    description: `Записи по теме ${tag}.`,
    site: context.site!,
    trailingSlash: true,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.summary,
      pubDate: post.data.date,
      link: `/posts/${post.id}/`,
      categories: post.data.tags,
      author: post.data.author,
    })),
    customData: `<language>ru</language>`,
  });
}
