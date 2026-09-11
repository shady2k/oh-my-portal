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
  /**
   * A QR code for the same address, shown on /about/ for a reader on a desktop
   * who wants to continue on their phone. The address does not change, so the
   * code is a drawn file in the content images, not generated at build.
   */
  qr: z
    .string()
    .regex(/^\/images\/[^?#]+\.(?:svg|webp|png)$/, 'an image under /images/, e.g. /images/author/telegram-qr.svg')
    .optional(),
});

export const author = z.strictObject({
  name: z.string().min(1),
  /**
   * The site's name: the wordmark, the tail of every title, og:site_name. Absent,
   * it is the author's name. A personal name on every masthead reads as
   * repetition once the same name also signs the articles and the footer.
   */
  site_name: z.string().min(1).max(40).optional(),
  /** The site's mark, under /images/: the favicon and the icon beside the wordmark. */
  icon: z
    .string()
    .regex(/^\/images\/[^?#]+\.(?:svg|png|webp)$/, 'an image under /images/, e.g. /images/site/icon.svg')
    .optional(),
  /**
   * The homepage's opening line, or several mottos with one printed per visit.
   * One per visit rather than a rotation: motion that never stops needs a pause
   * control (WCAG 2.2.2), and it competes with the reading it introduces.
   */
  headline: z
    .union([z.string().min(1).max(120), z.array(z.string().min(1).max(120)).min(1).max(8)])
    .optional(),
  /** One or two sentences. Ends every article, at the moment of peak interest (R5). */
  bio: z.string().min(1).max(400),
  /**
   * A portrait, shown beside the name on /about/ and in the author block.
   *
   * A path into the content images rather than any URL: `check-outputs.ts`
   * verifies every `/images/` reference exists in the build, and a portrait
   * hotlinked from another host breaks silently the day that host moves it —
   * while telling it about every reader in the meantime.
   */
  avatar: z
    .string()
    .regex(/^\/images\/[^?#]+\.(?:webp|avif|png|jpe?g)$/, 'a picture under /images/, e.g. /images/author/avatar.webp')
    .optional(),
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
  /** Optional editorial feature and its explanatory sketch. */
  question: z.string().min(1).max(180).optional(),
  /** Explicit editorial selection; can include paused experiments. */
  featured: z.boolean().optional(),
  observation: z.string().min(1).max(240).optional(),
  stages: z.array(z.strictObject({
    title: z.string().min(1).max(40),
    state: z.enum(['done', 'current', 'next']),
    post: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  }).refine((stage) => stage.state === 'next' || !!stage.post, {
    error: 'Completed and current stages must link to a post', path: ['post'],
  })).min(2).max(5).refine((stages) => stages.filter((s) => s.state === 'current').length <= 1, {
    error: 'Only one stage can be current',
  }).optional(),
  sketch: z.strictObject({
    /** Optional built-in illustrated plate; labels remain available to plain SVG. */
    artwork: z.enum(['memory-study']).optional(),
    annotations: z.tuple([
      z.string().min(1).max(50), z.string().min(1).max(50), z.string().min(1).max(50),
    ]).optional(),
    center: z.string().min(1).max(18),
    labels: z.tuple([z.string().min(1).max(18), z.string().min(1).max(18), z.string().min(1).max(18), z.string().min(1).max(18)]),
    caption: z.string().min(1).max(240),
  }).refine((sketch) => !sketch.annotations || !!sketch.artwork, {
    error: 'Illustrated annotations require an artwork', path: ['annotations'],
  }).optional(),
  state: z.enum(['active', 'maintained', 'paused', 'archived', 'experiment']),
  /** When the state above was last true. A register with no date is a claim. */
  since: z.coerce.date().optional(),
  repo: z.url().optional(),
  site: z.url().optional(),
});

export const projects = z.array(project);

export type Project = z.infer<typeof project>;
