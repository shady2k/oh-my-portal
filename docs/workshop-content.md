# Workshop content

The homepage is a selected project, three recent entries and the latest authored
change of mind. `/archive/` contains every visible entry; it has a Markdown twin.
Existing content without these optional fields still builds.

## A featured experiment

In `data/projects.yaml`, at most one project can set `featured: true`. This
selection may remain featured while paused. Otherwise the first active or
experimental project is used. Without a project the latest entry leads.

```yaml
- slug: example-experiment
  name: A question worth investigating
  summary: An explicitly synthetic experiment for demonstrating the engine.
  state: experiment
  featured: true
  since: 2026-09-08
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
```

There are two to five stages, with at most one `current` stage. Completed and
current stages require a `post` slug. References must resolve to visible posts
in the build; missing or draft-only evidence fails the production build instead
of publishing a dead or private link. Future stages can remain unlinked. The
illustration has exactly four short labels and an accessible caption. Use labels
that explain the selected experiment. It is a diagram, not measured telemetry.

The same trail, observation and diagram explanation travel to project Markdown
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
