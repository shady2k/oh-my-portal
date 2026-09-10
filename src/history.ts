import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, basename } from 'node:path';

import { articleMarkdown } from './projections.ts';
import type { Post } from './posts.ts';

/**
 * Provenance — design §1.
 *
 * The source of truth is a markdown file in git, which means two facts about an
 * article are available and checkable by anyone: exactly what the twin says, and
 * exactly when the file changed. Neither is a claim the site makes about itself;
 * both can be verified from outside it.
 */

/**
 * The sha256 of the markdown twin, over the same string the twin route serves.
 *
 * A reader — or somebody else's agent — can check it without trusting us:
 *
 *     curl -s https://<site>/posts/<slug>.md | sha256sum
 *
 * That only works because the hash is taken of `articleMarkdown()` rather than
 * of the source file: the twin is what is published, so the twin is what a hash
 * has to be about.
 */
export function twinHash(post: Post, site: URL): string {
  return createHash('sha256').update(articleMarkdown(post, site), 'utf8').digest('hex');
}

export interface Revision {
  /** ISO date, author date rather than commit date — when it was written. */
  date: string;
  /** Abbreviated commit hash. */
  hash: string;
}

/**
 * The file's commits, newest first.
 *
 * Read from whatever repository the file actually lives in — the engine builds
 * against a content checkout it does not own (§2), so git runs in the file's own
 * directory rather than in this one.
 *
 * **Absence is a normal answer.** A shallow CI clone has no history, a tarball
 * has no repository at all, and a file added but not yet committed has no
 * commits. All three return an empty list, and the page says so rather than
 * inventing a row: the whole point of publishing an edit history is that it can
 * be checked, and a fabricated one would be worse than none.
 */
export function fileHistory(filePath: string | undefined): Revision[] {
  if (!filePath) return [];
  try {
    const out = execFileSync('git', ['log', '--follow', '--date=short', '--format=%ad %h', '--', basename(filePath)], {
      cwd: dirname(filePath),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [date, hash] = line.split(' ');
        return { date, hash };
      });
  } catch {
    /* Not a repository, no history, or no git. The page handles an empty list. */
    return [];
  }
}
