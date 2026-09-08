import type { APIContext } from 'astro';

import { llmsTxt } from '../projections.ts';
import { listPosts, listTags } from '../posts.ts';

/** `/llms.txt` — the site map the `Link` header on every response advertises (§6). */
export async function GET({ site }: APIContext) {
  const tags = (await listTags()).map(({ tag }) => tag);
  return new Response(llmsTxt(await listPosts(), site!, tags), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
