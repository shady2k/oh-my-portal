import type { APIContext } from 'astro';

import { projectsMarkdown } from '../../projections.ts';
import { getPage } from '../../posts.ts';
import { listProjects, STATE_LABEL } from '../../site.ts';

/** `/projects/index.md` — the register for a client that negotiated markdown. */
export async function GET(_context: APIContext) {
  const page = await getPage('projects');
  return new Response(projectsMarkdown(await listProjects(), STATE_LABEL, page?.body), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
