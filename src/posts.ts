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

/** Whether an entry may be shown at all in this build. */
const visible = ({ data }: Post) => PREVIEW || data.status === 'published';

/**
 * Every article this build may publish, newest first.
 *
 * `kind: page` is excluded: pages are one type with the articles (§4) but they
 * have their own addresses — `/about/`, not `/posts/about/` — so they belong in
 * neither the listings nor the feeds.
 */
export async function listPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', (entry) => visible(entry) && entry.data.kind !== 'page');
  return posts.sort(byDateDesc);
}

/**
 * A standalone page by slug — the prose for `/about/` and `/projects/`.
 *
 * It is content, so it lives in the content repository like everything else and
 * this repository only knows the address it renders at. Absent is a normal
 * state: the page still builds from the site data alone.
 */
export async function getPage(slug: string): Promise<Post | undefined> {
  const pages = await getCollection('posts', (entry) => visible(entry) && entry.data.kind === 'page');
  return pages.find((page) => page.id === slug);
}

/**
 * Reading time in minutes, from the body.
 *
 * Computed rather than stored: a number in the frontmatter goes stale the first
 * time a paragraph is edited, and nothing on a listing may be a number nobody
 * checks. 180 words a minute is the low end for technical Russian prose, which
 * is the right end to be on — an underestimate reads as honest, an overestimate
 * reads as padding.
 */
export function readMinutes(post: Post): number {
  const words = post.body?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  return Math.max(1, Math.round(words / 180));
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
