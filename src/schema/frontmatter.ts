import { z } from 'zod';

/**
 * Frontmatter schema — design §4, §6.
 *
 * This is the agent's contract. It is deliberately `strictObject`: an unknown
 * key fails the build instead of being silently ignored, so an agent that
 * invents a field finds out at once (design §9). It is also the typed
 * specification an agent can read, which is why the shapes below carry the
 * constraints rather than leaving them to prose.
 */

/** Short, lowercase, hyphen-separated. Design §5: slugs name the subject. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A site-absolute path with a trailing slash: `/`, `/about/`, `/tag/k8s/`. */
const PATH = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/;

const slug = z.string().regex(SLUG, 'lowercase words separated by single hyphens');

/** `tools` and `recipe.stack` are the same shape and are kept identical on purpose. */
const toolRef = z.strictObject({
  name: z.string().min(1),
  version: z.string().min(1),
});

/**
 * The article core (design §6). Facts in structured form; the prose is
 * commentary around them. Absent on essays — a missing `recipe` is a normal
 * state, not an unfilled field.
 */
const recipe = z.strictObject({
  goal: z.string().min(1),
  /** Travels into the `.json` twin with the canonical URL, so it is not optional. */
  verified_on: z.coerce.date(),
  stack: z.array(toolRef).optional(),
  steps: z
    .array(
      z.strictObject({
        id: slug,
        cmd: z.string().min(1),
        note: z.string().optional(),
      }),
    )
    .optional(),
  pitfalls: z
    .array(
      z.strictObject({
        symptom: z.string().min(1),
        cause: z.string().min(1),
        fix: z.string().min(1),
      }),
    )
    .optional(),
  do_not: z.array(z.string().min(1)).optional(),
});

export const frontmatter = z
  .strictObject({
    // --- required ---
    title: z.string().min(1),
    /** Authoritative: the route is built from this, not from the filename. */
    slug,
    date: z.coerce.date(),
    kind: z.enum(['article', 'note', 'page']),
    /** A draft never reaches production — not by address, not in feeds (design §4). */
    status: z.enum(['draft', 'published']),
    /** Design §8: disclosing authorship is part of the product, so it is never inferred. */
    author: z.enum(['human', 'being']),
    /** One sentence. Feeds llms.txt, the feeds and the cards, so length is capped. */
    summary: z.string().min(1).max(200),
    /**
     * May be empty. A tag earns its place by grouping several posts; a post
     * that joins no group carries none rather than inventing a category of one.
     */
    tags: z.array(slug),
    /** Authoritative for hreflang and for the language field in llms.txt and /index.json. */
    lang: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/, 'BCP 47, e.g. `ru` or `pt-BR`'),

    // --- optional ---
    /** Old addresses this entry answers to, for URL preservation on rename. */
    aliases: z.array(z.string().regex(PATH, 'site-absolute path with a trailing slash')).optional(),
    updated: z.coerce.date().optional(),
    /** Authored changes of mind; original prose remains intact. */
    revisions: z.array(z.strictObject({
      date: z.coerce.date(),
      before: z.string().min(1).max(300),
      after: z.string().min(1).max(300),
      reason: z.string().min(1).max(600),
    })).min(1).optional(),
    tools: z.array(toolRef).optional(),
    sources: z.array(z.url()).optional(),
    related: z.array(slug).optional(),
    /**
     * The projects this entry belongs to: each one's page lists the entry, and
     * the entry links back. One slug, or a list for an entry about several;
     * read it through `projectsOf`, which gives a list either way.
     */
    project: z
      .union([slug, z.array(slug).min(1).refine((list) => new Set(list).size === list.length, 'a project is named once')])
      .optional(),
    recipe: recipe.optional(),
  })
  .refine((d) => !d.updated || d.updated >= d.date, {
    error: '`updated` cannot be earlier than `date`',
    path: ['updated'],
  })
  .refine((d) => !d.related?.includes(d.slug), {
    error: '`related` cannot list the entry itself',
    path: ['related'],
  })
  .refine((d) => !d.revisions || d.revisions.every((r) => r.date >= d.date && !!d.updated && r.date <= d.updated), {
    error: 'Revisions must fall between publication and the updated date',
    path: ['revisions'],
  });

export type Frontmatter = z.infer<typeof frontmatter>;

/** The projects an entry names, as a list whether it was written as one slug or several. */
export const projectsOf = (data: { project?: string | string[] }): string[] =>
  data.project === undefined ? [] : ([] as string[]).concat(data.project);
