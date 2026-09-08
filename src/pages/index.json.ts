import type { APIContext } from 'astro';

import { indexJson } from '../projections.ts';
import { listPosts } from '../posts.ts';

/**
 * `/index.json` — the whole catalogue in one request.
 *
 * Design §6: the agent filters locally rather than walking the site. It is not
 * content and takes no language prefix.
 */
export async function GET({ site }: APIContext) {
  return new Response(JSON.stringify(indexJson(await listPosts(), site!), null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
