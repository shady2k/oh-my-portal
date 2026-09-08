import type { APIContext } from 'astro';

import { articleMarkdown } from '../../projections.ts';
import { listPosts, type Post } from '../../posts.ts';

/** `/posts/<slug>.md` — the direct address, so a link can be handed over by hand (§6). */
export async function getStaticPaths() {
  const posts = await listPosts();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}

export function GET({ props, site }: APIContext & { props: { post: Post } }) {
  return new Response(articleMarkdown(props.post, site!), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
