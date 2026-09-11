import type { APIContext } from 'astro';

import { projectsMarkdown } from '../../projections.ts';
import { getPage } from '../../posts.ts';
import { listProjects, STATE_LABEL } from '../../projects.ts';

/** `/projects/index.md` — the register for a client that negotiated markdown. */
export async function GET({ site }: APIContext) {
  const page = await getPage('projects');
  return new Response(projectsMarkdown(await listProjects(), STATE_LABEL, site!, page?.body), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
