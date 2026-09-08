import type { APIContext } from 'astro';

import { articleJson } from '../../projections.ts';
import { listPosts, type Post } from '../../posts.ts';

/**
 * `/posts/<slug>.json` — the core and the metadata, field by field.
 *
 * Deliberately no prose: text lives in the `.md` twin, which this file links to.
 * Carrying the article body here would cost escaping and `\n` around every
 * field, and would give the two files something to disagree about.
 */
export async function getStaticPaths() {
  const posts = await listPosts();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}

export function GET({ props, site }: APIContext & { props: { post: Post } }) {
  return new Response(JSON.stringify(articleJson(props.post, site!), null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
