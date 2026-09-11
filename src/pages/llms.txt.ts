import type { APIContext } from 'astro';

import { llmsTxt } from '../projections.ts';
import { listPosts, listTags } from '../posts.ts';
import { listProjects, STATE_LABEL } from '../projects.ts';

/** `/llms.txt` — the site map the `Link` header on every response advertises (§6). */
export async function GET({ site }: APIContext) {
  const tags = (await listTags()).map(({ tag }) => tag);
  return new Response(llmsTxt(await listPosts(), site!, tags, await listProjects(), STATE_LABEL), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
