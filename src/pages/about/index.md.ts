import type { APIContext } from 'astro';

import { aboutMarkdown } from '../../projections.ts';
import { getPage } from '../../posts.ts';
import { getAuthor } from '../../site.ts';

/** `/about/index.md` — what `/about/` serves to a client that negotiated markdown. */
export async function GET(_context: APIContext) {
  const page = await getPage('about');
  return new Response(aboutMarkdown(await getAuthor(), page?.body), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
