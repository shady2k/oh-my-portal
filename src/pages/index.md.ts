import type { APIContext } from 'astro';

import { catalogueMarkdown } from '../projections.ts';
import { listPosts } from '../posts.ts';

/** `/index.md` — what `/` serves to a client that negotiated markdown. */
export async function GET({ site }: APIContext) {
  return new Response(catalogueMarkdown(await listPosts(), site!), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
