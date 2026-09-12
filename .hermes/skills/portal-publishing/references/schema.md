# The schemas your text must satisfy

Two files define everything an article or a project page may say:
`src/schema/frontmatter.ts` and `src/schema/project.ts` in the engine. Both are
plain Zod (no Astro), both are `strictObject`, and both are enforced at build
time. **An unknown key fails the build** rather than being ignored — inventing a
field is not a way to extend the format, so if you need one, that is a
conversation and an engine change, not a commit here.

## A post — `content/posts/<slug>.md`

Required:

| field | rule |
|---|---|
| `title` | non-empty |
| `slug` | lowercase words, single hyphens; this is the address, not the file name |
| `date` | a date (`2026-06-21`) |
| `kind` | `article`, `note` or `page` |
| `status` | `draft` or `published`; a draft never reaches production |
| `author` | `human` or `being` — never inferred, see the Procedure |
| `summary` | one sentence, at most 200 characters; feeds llms.txt, the feeds and the cards |
| `tags` | array of slugs; **may be empty** — a tag earns its place by grouping several posts |
| `lang` | BCP 47, e.g. `ru` or `pt-BR`; authoritative for hreflang and for the twins |

Optional, and this is where the ai-first layer comes from:

| field | rule |
|---|---|
| `aliases` | site-absolute paths with trailing slashes — old addresses this entry answers to |
| `updated` | a date, not earlier than `date` |
| `revisions` | `{date, before ≤300, after ≤300, reason ≤600}`, each date between `date` and `updated` (which is then required) |
| `tools` | `{name, version}` pairs the article covers |
| `sources` | URLs; what the fact check filled |
| `related` | slugs; cannot name the entry itself |
| `project` | the slug of the project this entry belongs to, or a list of slugs when it is about several — each named once |
| `recipe` | the structured core: `goal`, `verified_on`, optional `stack`, `steps`, `pitfalls`, `do_not` |

Three rules the schema itself enforces, each with a reason worth knowing:
`updated` cannot precede `date`; `related` cannot list the entry itself; a
revision cannot fall outside the window it claims to fall in.

## A project page — `content/projects/<slug>.md`

The file name **is** the slug; the build refuses a page whose slug disagrees with
it, and `index` is reserved. The frontmatter is the register a reader uses to
decide whether to trust the project, and the state is what makes it worth
having: a list of links goes stale invisibly, "archived since 2024" does not.

Required: `title`, `slug`, `status` (`draft|published`), `lang`, `state`
(`active`, `maintained`, `paused`, `archived`, `experiment`), `summary` (≤300).

Optional: `since` (when that state was last true), `featured` (at most one
project may be), `question` (≤180), `observation` (≤240), `stages` (2–5 of
`{title ≤40, state: done|current|next, post?}`, at most one `current`), `sketch`,
`repo`, `site`.

`sketch` is either the built-in artwork or your own image under `/images/`, not
both, with a `caption` (≤240) either way; a drawn diagram needs its `center` and
four `labels`; annotations require an artwork or an image.

A post names its project with `project: some-project`. The build refuses a post
naming a project that is not published, a stage whose post names another project
or none, a second featured project, and a leftover `data/projects.yaml`.

## The one field that is never yours to infer

`author`. It follows the entry point, not the text: the maintainer asked →
`human`; nobody asked → `being`. Disclosure is part of the product, and the
field is how a reader is never in doubt about who wrote what.
