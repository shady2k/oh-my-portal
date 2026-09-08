import { parse as parseYaml } from 'yaml';

import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';

import { frontmatter } from './schema/frontmatter.js';
import { author, project } from './schema/site.js';

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
 * `data/author.yaml` and `data/projects.yaml` (§4). Same story as `posts`: the
 * content repository supplies them, `DATA_DIR` says where, and `examples/data`
 * is what this repository builds against.
 */
const dataDir = process.env.DATA_DIR ?? 'content/data';

const site = defineCollection({
  loader: file(`${dataDir}/author.yaml`, { parser: (text) => ({ author: parseYaml(text) }) }),
  schema: author,
});

const projects = defineCollection({
  // Keyed by slug so the entry id comes from the key and no synthetic `id`
  // field has to be added to the data, which the strict schema would reject.
  loader: file(`${dataDir}/projects.yaml`, {
    parser: (text) =>
      Object.fromEntries(
        (parseYaml(text) as { slug: string }[]).map((entry) => [entry.slug, entry]),
      ),
  }),
  schema: project,
});

export const collections = { posts, site, projects };
