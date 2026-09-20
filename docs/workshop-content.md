# Workshop content

The homepage is a selected project, three recent entries and the latest authored
change of mind. `/archive/` contains every visible entry; it has a Markdown twin.
Existing content without these optional fields still builds.

## A featured experiment

A project is a markdown file, `projects/<slug>.md`, whose file name is its
slug (`index` is reserved for the projects listing itself). Its frontmatter is
the register; its body is the project page's own prose — the same idea as a
post's frontmatter and body. At most one project file can set
`featured: true`. This selection may remain featured while paused. Otherwise
the first active or experimental project is used. Without a project the latest
entry leads.

```markdown
---
title: A question worth investigating
slug: example-experiment
status: published
lang: en
state: experiment
summary: An explicitly synthetic experiment for demonstrating the engine.
since: 2026-09-08
featured: true
observation: What the most recent attempt revealed.
question: What remains unresolved?
stages:
  - title: Prototype
    state: done
    post: example-prototype
  - title: Verification
    state: current
    post: example-verification
  - title: Next question
    state: next
sketch:
  center: agent
  labels: [memory, experience, initiative, character]
  caption: Four influences connected to the agent in this experiment.
repo: https://github.com/example/example
site: https://example.org/
---

Demonstration text for the project page itself: what the fields above cannot
say — how the experiment is structured, what has already been checked, and
what comes next.
```

A post names the project it belongs to with `project: example-experiment` in
its own frontmatter.

There are two to five stages, with at most one `current` stage. A stage's
`post` is optional for every state — a planned stage has no evidence yet, and
that is why the link is optional rather than required once a stage is done or
current. Future stages can remain unlinked. The illustration has exactly four
short labels and an accessible caption. Use labels that explain the selected
experiment. It is a diagram, not measured telemetry. `repo` and `site` are
optional: links to the project's repository and its own site, shown on the
project page when present.

The build refuses: a post naming a project that is not published; a stage
linking a post that is not published, or that names a different project (or
none); more than one project set `featured: true`; a project whose `slug`
differs from its file name; a project file named `index.md`; and a leftover
`data/projects.yaml` — that register is retired, and the build refuses rather
than silently ignoring it.

The same trail, observation and diagram explanation travel to the project page
and the homepage Markdown catalogue. A project without a sketch has no invented
illustration. Nothing fetches private activity or infers current work.

For the built-in graphite study, set `sketch.artwork: memory-study` and optionally
`sketch.annotations` to exactly three short strings (up to 50 characters each):
the memory cards, the growing plant, and the broken connection, in that order.
Annotations require the matching artwork. They are real HTML text in a locally
served handwriting font, not baked into the image; Markdown includes them too.
Write a caption describing the picture as a metaphor, not measured evidence.
Astro creates responsive WebP images, with the original accessible on click.
The source illustration and generation prompt are in `src/assets/illustrations/`.

## An entry's cover

An entry may name one picture to stand for it. It is the card the entry is
shared with — in a chat window, in a feed reader, in a search result — in place
of the site's fixed one. It appears nowhere on the site's own pages.

```yaml
cover:
  image: /images/my-entry/cover.webp
  alt: "Что на картинке — одним предложением."
```

The path is absolute under `/images/`, like every other content picture, so the
file travels with the article. Every segment must begin with a letter or digit,
which is what keeps a dot segment such as `/images/../og.png` out — that one
resolved onto a real file and passed the build gate while pointing outside the
content tree entirely. Extensions are lowercase: the static host is
case-sensitive, so `cover.JPG` on disk against `cover.jpg` here is a working
picture on your laptop and a broken one in production.

`alt` describes the picture and is required: it becomes `og:image:alt`, which is
what somebody using a screen reader is told the shared card shows.

The build refuses to finish if the file is not there. A card lives in the head
rather than on the page, so a missing one is invisible on the site and shows up
only as a blank preview in somebody else's chat window — which is exactly the
kind of failure the build gate exists to catch before a reader does.

The cover is named here rather than taken from the body on purpose. The first
picture in an article is usually a diagram, and a diagram outside its article
explains nothing; a cover is chosen for the job, which only the author can judge.

Author it at **1200×630**, which is the size every card reader expects, and keep
it under about 300KB. Nothing resizes it — content pictures are copied in after
the build — so the file you commit is the file a crawler downloads.

Another shape still works, and the engine declares no dimensions for a cover
precisely so a reader measures the file rather than trusting a number. But the
cropping is then somebody else's: a square picture is cut to a wide frame by
most card readers, and whatever runs along its top or bottom edge is what goes.
If the picture's meaning lives at an edge, give it the 1200×630 frame yourself.

The field is optional; an entry without one is shared with the site's card.

## A change of mind

Append a revision to the original article frontmatter and advance `updated`:

```yaml
updated: 2026-09-08
revisions:
  - date: 2026-09-08
    before: The original position.
    after: The revised position.
    reason: The concrete observation that changed the conclusion.
```

The original article body remains intact. Revisions render newest-first above
it, with an anchor at `#revisions`. The most recent revision across visible posts
appears on the homepage and links back to the original article. Every revision
date must fall between the article date and `updated`. Keep all earlier revision
entries when appending a new one. A revision is an editorial statement, never
automatically manufactured from an article's pitfalls or git diff.

Both article twins include all revisions; dates are ISO in machine outputs and
Russian editorial dates in the rendered page. The RSS article link is unchanged.
The feed does not turn a revision into a new article or reset publication dates.

## Verification

Run `npm run verify`, then `npm run build:examples`. Build-based test suites run
sequentially: Astro uses shared `.astro` temporary files even with different
output directories. Start the preview and run `npm run screenshot` to inspect
the homepage, archive, projects and revised article at desktop/mobile sizes.
