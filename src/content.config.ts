import { parse as parseYaml } from 'yaml';

import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';

import { frontmatter } from './schema/frontmatter.js';
import { author } from './schema/site.js';
import { project } from './schema/project.js';

/**
 * The schema itself lives in `src/schema/frontmatter.ts` and is plain Zod, so
 * it can be imported without booting Astro — by the content repository's CI
 * path checks (design §9) and by the agent tooling (§10, phase 1d). This file
 * is only the Astro binding.
 */
const posts = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    // The content repository mounts its own `content/posts`. This repository has
    // none, so its own dev server and tests point at `examples/posts` instead —
    // two deliberately synthetic articles that show the shape without the engine
    // ever carrying an article of its own.
    base: process.env.CONTENT_DIR ?? 'content/posts',
    // The frontmatter `slug` wins over the file path, so renaming a file is not
    // a URL change and the redirect map stays the only place addresses move.
    generateId: ({ data }) => String(data.slug),
  }),
  schema: frontmatter,
});

/**
 * `data/author.yaml` (§4). Same story as `posts`: the content repository
 * supplies it, `DATA_DIR` says where, and `examples/data` is what this
 * repository builds against.
 */
const dataDir = process.env.DATA_DIR ?? 'content/data';

const site = defineCollection({
  loader: file(`${dataDir}/author.yaml`, { parser: (text) => ({ author: parseYaml(text) }) }),
  schema: author,
});

/**
 * `projects/<slug>.md` — one file per project (project-pages design §3). The
 * frontmatter is the register, the body is the project page.
 *
 * The id is the file name, not the frontmatter `slug`. The glob loader would
 * otherwise take `slug` and let two files with the same one overwrite each other
 * without a word; a file name cannot be shared, and `linkProblems()` checks that
 * the slug agrees with it.
 */
const projects = defineCollection({
  loader: glob({
    pattern: '*.md',
    base: process.env.PROJECTS_DIR ?? 'content/projects',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: project,
});

export const collections = { posts, site, projects };
