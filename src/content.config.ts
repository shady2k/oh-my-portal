import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

import { frontmatter } from './schema/frontmatter.js';

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

export const collections = { posts };
