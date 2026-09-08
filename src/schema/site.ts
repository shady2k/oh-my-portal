import { z } from 'zod';

/**
 * The site's own data — design §4: `data/author.yaml` and `data/projects.yaml`.
 *
 * These live in the content repository, never here (§2). This file is the
 * contract they must satisfy, and it is `strictObject` for the same reason the
 * frontmatter schema is: a field nobody defined breaks the build instead of
 * being silently ignored.
 *
 * Nothing in this repository fills these in. `examples/data` holds obviously
 * synthetic values so the engine builds and so the shape is visible.
 */

const link = z.strictObject({
  label: z.string().min(1),
  href: z.string().min(1),
});

export const author = z.strictObject({
  name: z.string().min(1),
  /** One or two sentences. Ends every article, at the moment of peak interest (R5). */
  bio: z.string().min(1).max(400),
  /**
   * R3: a way to make contact, visible from any page. Exactly one, because a
   * list of six ways to reach someone is a way of not being reachable.
   */
  contact: link,
  /** R4: GitHub and whatever else belongs beside it, visible from any article. */
  links: z.array(link).default([]),
  /**
   * Where the subscription form posts (R6). A deployment detail — the endpoint
   * proxies to a mail service with regional deliverability (§7) — so it is data,
   * not a constant in the templates.
   */
  subscribe_action: z.string().min(1).optional(),
});

export type Author = z.infer<typeof author>;

/**
 * A project register, not a link list (§12). `state` is the reason the page
 * exists: a list of repository links says nothing a reader could not get from a
 * profile page, and it goes stale without anyone being able to tell.
 */
export const project = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  summary: z.string().min(1).max(300),
  state: z.enum(['active', 'maintained', 'paused', 'archived', 'experiment']),
  /** When the state above was last true. A register with no date is a claim. */
  since: z.coerce.date().optional(),
  repo: z.url().optional(),
  site: z.url().optional(),
});

export const projects = z.array(project);

export type Project = z.infer<typeof project>;
