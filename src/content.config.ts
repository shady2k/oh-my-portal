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
  // The content repository supplies `content/`; this repository ships none of
  // its own (design §2). An absent directory yields an empty collection.
  loader: glob({
    pattern: '**/*.md',
    base: 'content/posts',
    // The frontmatter `slug` wins over the file path, so renaming a file is not
    // a URL change and the redirect map stays the only place addresses move.
    generateId: ({ data }) => String(data.slug),
  }),
  schema: frontmatter,
});

export const collections = { posts };
