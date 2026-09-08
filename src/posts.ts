import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/**
 * Whether this build may show drafts.
 *
 * Design §4: a draft never reaches production — not by address, not in feeds.
 * Design §7: the preview build exists precisely to show one, on a closed host
 * behind basic auth. So the rule is one environment variable and one place,
 * rather than a `status` check repeated in every page and eventually forgotten
 * in one of them.
 */
export const PREVIEW = process.env.PREVIEW === '1';

/** Newest first. Every listing and every feed sorts the same way. */
const byDateDesc = (a: Post, b: Post) => b.data.date.getTime() - a.data.date.getTime();

/** Every post this build is allowed to publish, newest first. */
export async function listPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => PREVIEW || data.status === 'published');
  return posts.sort(byDateDesc);
}

/** The tags actually in use, with their counts, most-used first then alphabetical. */
export async function listTags(): Promise<{ tag: string; count: number }[]> {
  const counts = new Map<string, number>();
  for (const post of await listPosts()) {
    for (const tag of post.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
