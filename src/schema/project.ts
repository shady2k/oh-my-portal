import { z } from 'zod';

/**
 * A project — one markdown file per project (project-pages design §3).
 *
 * The frontmatter is the register: the state a reader needs to trust a project
 * page, and what the homepage feature, the register and the machine versions
 * are built from. The body is the project page's own prose.
 *
 * Plain Zod, like `frontmatter.ts`, so the content repository's checks and the
 * agent tooling import it without booting Astro. A `strictObject`, so a field
 * nobody defined fails the build instead of being silently ignored.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slug = z.string().regex(SLUG, 'lowercase words separated by single hyphens');

/** A drawing of the project, with the notes written on it. */
export const sketch = z.strictObject({
  /** Optional built-in illustrated plate; labels remain available to plain SVG. */
  artwork: z.enum(['memory-study']).optional(),
  /**
   * A picture of the project from the content images, in place of the built-in
   * plate. Under /images/ for the same reason as the portrait: check-outputs.ts
   * proves it is in the build, and no other host learns about every reader.
   */
  image: z
    .string()
    .regex(/^\/images\/[^?#]+\.(?:svg|webp|png|jpe?g|avif)$/, 'an image under /images/, e.g. /images/projects/drawing.svg')
    .optional(),
  annotations: z.tuple([
    z.string().min(1).max(50), z.string().min(1).max(50), z.string().min(1).max(50),
  ]).optional(),
  /** The drawn diagram's centre and four labels. A picture needs neither. */
  center: z.string().min(1).max(18).optional(),
  labels: z.tuple([z.string().min(1).max(18), z.string().min(1).max(18), z.string().min(1).max(18), z.string().min(1).max(18)]).optional(),
  caption: z.string().min(1).max(240),
}).refine((s) => !s.annotations || !!s.artwork || !!s.image, {
  error: 'Illustrated annotations require an artwork or an image', path: ['annotations'],
}).refine((s) => !(s.artwork && s.image), {
  error: 'A sketch is either the built-in artwork or an image, not both', path: ['image'],
}).refine((s) => !!s.artwork || !!s.image || (!!s.center && !!s.labels), {
  error: 'A drawn diagram needs its centre and labels', path: ['labels'],
});

export const project = z.strictObject({
  // --- required ---
  title: z.string().min(1),
  /** The address. It must equal the file name, which the build checks (§3.3). */
  slug,
  /** A draft never reaches production — the same rule as a post's. */
  status: z.enum(['draft', 'published']),
  /** Authoritative for the page's language, as for posts. */
  lang: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/, 'BCP 47, e.g. `ru` or `pt-BR`'),
  /** The reason the register exists: a list of links goes stale invisibly, a state does not. */
  state: z.enum(['active', 'maintained', 'paused', 'archived', 'experiment']),
  summary: z.string().min(1).max(300),

  // --- optional ---
  /** When the state above was last true. A register with no date is a claim. */
  since: z.coerce.date().optional(),
  /** Explicit editorial selection for the homepage; at most one (§3.3). */
  featured: z.boolean().optional(),
  question: z.string().min(1).max(180).optional(),
  observation: z.string().min(1).max(240).optional(),
  /**
   * The course of the project, authored in order. A stage may link the post that
   * records it; planned stages have none yet, and that is why the link is
   * optional for every state.
   */
  stages: z.array(z.strictObject({
    title: z.string().min(1).max(40),
    state: z.enum(['done', 'current', 'next']),
    post: slug.optional(),
  })).min(2).max(5).refine((stages) => stages.filter((s) => s.state === 'current').length <= 1, {
    error: 'Only one stage can be current',
  }).optional(),
  sketch: sketch.optional(),
  repo: z.url().optional(),
  site: z.url().optional(),
});

export type ProjectFrontmatter = z.infer<typeof project>;
