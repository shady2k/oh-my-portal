import type { APIContext } from 'astro';

import { projectMarkdown } from '../../../projections.ts';
import { listProjects, postsOf, STATE_LABEL, type Project } from '../../../projects.ts';

/**
 * `/projects/<slug>/index.md` — the markdown half of the negotiated address,
 * beside `index.html` for the same reason as an article's (see
 * `src/pages/posts/[slug]/index.md.ts`).
 */
export async function getStaticPaths() {
  return (await listProjects()).map((project) => ({ params: { slug: project.id }, props: { project } }));
}

export async function GET({ props, site }: APIContext & { props: { project: Project } }) {
  return new Response(projectMarkdown(props.project, await postsOf(props.project), site!, STATE_LABEL), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
