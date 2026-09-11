import { getEntry } from 'astro:content';

import type { Author } from './schema/site.ts';

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
