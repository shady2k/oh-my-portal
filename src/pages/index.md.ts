import type { APIContext } from 'astro';

import { catalogueMarkdown, projectsMarkdown } from '../projections.ts';
import { listPosts } from '../posts.ts';
import { listProjects, STATE_LABEL } from '../projects.ts';

/** `/index.md` — what `/` serves to a client that negotiated markdown. */
export async function GET({ site }: APIContext) {
  const projects = await listProjects();
  const markdown = catalogueMarkdown(await listPosts(), site!) +
    (projects.length ? '\n' + projectsMarkdown(projects, STATE_LABEL, site!) : '');
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
