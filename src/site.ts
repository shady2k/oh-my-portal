import { getCollection, getEntry } from 'astro:content';

import type { Author, Project } from './schema/site.ts';

/**
 * The site's own data — design §4.
 *
 * It comes from the content repository, so every template reads it through
 * here rather than hard-coding a name, a link or an address. That is what makes
 * this repository an engine and not a site (§2).
 */

/** Absent while a content repository is not mounted; every caller must cope. */
export async function getAuthor(): Promise<Author | undefined> {
  const entry = await getEntry('site', 'author');
  return entry?.data;
}

/**
 * The project register, most recently changed first, and archived projects last
 * regardless — an archive is a footnote, not news.
 */
export async function listProjects(): Promise<Project[]> {
  const entries = await getCollection('projects');
  const rank: Record<Project['state'], number> = {
    active: 0,
    maintained: 1,
    experiment: 2,
    paused: 3,
    archived: 4,
  };
  return entries
    .map((entry) => entry.data)
    .sort(
      (a, b) =>
        rank[a.state] - rank[b.state] || (b.since?.getTime() ?? 0) - (a.since?.getTime() ?? 0),
    );
}

/** How each state reads to a human. The vocabulary is the register's whole value. */
export const STATE_LABEL: Record<Project['state'], string> = {
  active: 'в работе',
  maintained: 'поддерживается',
  experiment: 'эксперимент',
  paused: 'на паузе',
  archived: 'в архиве',
};
