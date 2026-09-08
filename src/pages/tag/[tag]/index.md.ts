import type { APIContext } from 'astro';

import { catalogueMarkdown } from '../../../projections.ts';
import { listPosts, listTags, type Post } from '../../../posts.ts';

/**
 * `/tag/<tag>/index.md` — the markdown half of a tag listing.
 *
 * Every HTML address needs one of these: under the index-file swap an address
 * without an `index.md` is a 404 for a client that asked for markdown, which is
 * worse than serving it HTML. scripts/check-outputs.ts enforces it (R10).
 */
export async function getStaticPaths() {
  const posts = await listPosts();
  const tags = await listTags();
  return tags.map(({ tag }) => ({
    params: { tag },
    props: { tag, posts: posts.filter((p) => p.data.tags.includes(tag)) },
  }));
}

export function GET({ props, site }: APIContext & { props: { tag: string; posts: Post[] } }) {
  const body = `# Тема: ${props.tag}\n\n${catalogueMarkdown(props.posts, site!).replace(/^# .*\n\n/, '')}`;
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
