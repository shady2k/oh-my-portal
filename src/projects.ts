import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { getCollection, type CollectionEntry } from 'astro:content';

import { linkProblems } from './project-links.ts';
import { listPosts, PREVIEW, type Post } from './posts.ts';
import type { ProjectFrontmatter } from './schema/project.ts';

export type Project = CollectionEntry<'projects'>;

/**
 * The projects this build publishes, most recently changed first, and archived
 * ones last regardless — an archive is a footnote, not news.
 *
 * Every page that shows a project comes through here, so this is where the build
 * refuses content whose posts and projects disagree (project-pages §3.3), with
 * every problem in one message.
 */
export async function listProjects(): Promise<Project[]> {
  const entries = await getCollection('projects');
  const problems = linkProblems({
    posts: (await listPosts()).map((post) => ({ id: post.id, project: post.data.project })),
    projects: entries.map(({ id, data }) => ({
      id,
      slug: data.slug,
      status: data.status,
      featured: data.featured,
      stages: data.stages,
    })),
    preview: PREVIEW,
    legacyRegister: existsSync(join(process.env.DATA_DIR ?? 'content/data', 'projects.yaml')),
  });
  if (problems.length) throw new Error(`Posts and projects disagree:\n  - ${problems.join('\n  - ')}`);

  const rank: Record<ProjectFrontmatter['state'], number> = {
    active: 0,
    maintained: 1,
    experiment: 2,
    paused: 3,
    archived: 4,
  };
  return entries
    .filter(({ data }) => PREVIEW || data.status === 'published')
    .sort(
      (a, b) =>
        rank[a.data.state] - rank[b.data.state] ||
        (b.data.since?.getTime() ?? 0) - (a.data.since?.getTime() ?? 0),
    );
}

/** The posts that name this project, newest first. */
export async function postsOf(project: { id: string }): Promise<Post[]> {
  return (await listPosts()).filter((post) => post.data.project === project.id);
}

/** How each state reads to a human. The vocabulary is the register's whole value. */
export const STATE_LABEL: Record<ProjectFrontmatter['state'], string> = {
  active: 'в работе',
  maintained: 'поддерживается',
  experiment: 'эксперимент',
  paused: 'на паузе',
  archived: 'в архиве',
};
