import type { APIContext } from 'astro';

import { articleMarkdown } from '../../../projections.ts';
import { listPosts, type Post } from '../../../posts.ts';

/**
 * `/posts/<slug>/index.md` — the markdown half of the negotiated address.
 *
 * It sits beside `index.html` in the same tree rather than in a second tree of
 * its own: nginx picks the index file from `Accept` (see nginx/site.conf.example),
 * which needs one map instead of a second root, a second deploy and a second
 * thing to fall out of step. The `.md` twin at `/posts/<slug>.md` is the same
 * bytes at a hand-linkable address.
 */
export async function getStaticPaths() {
  const posts = await listPosts();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}

export function GET({ props, site }: APIContext & { props: { post: Post } }) {
  return new Response(articleMarkdown(props.post, site!), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
