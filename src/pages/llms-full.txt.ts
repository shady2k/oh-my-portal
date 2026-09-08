import type { APIContext } from 'astro';

import { llmsFullTxt } from '../projections.ts';
import { listPosts } from '../posts.ts';

/** `/llms-full.txt` — every article in full, for a client that would rather fetch once. */
export async function GET({ site }: APIContext) {
  return new Response(llmsFullTxt(await listPosts(), site!), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
