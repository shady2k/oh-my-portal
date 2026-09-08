# oh-my-portal — engine design

A publishing engine for `shady2k.ru`, replacing Ghost. Two goals: make an
**agent publishing pipeline easy to build**, and ship an **ai-first site for the
public**.

---

## 1. The one decision everything follows from

> **The source of truth is markdown with frontmatter, in git.**

Not a database, not an editor's rich-text JSON. That single choice gives us,
almost for free: agent edits (an ordinary commit), review (an ordinary diff),
history (`git log`), rollback, permission boundaries (path checks in CI), `.md`
twins (the source *is* the twin), and dense packages for other people's agents
(assembled from frontmatter).

Ghost is unsuitable for exactly this reason — not because "it is built for
humans who click". Its content lives in a database in the editor's own format,
and every property above would have to be clawed back one at a time.

## 2. What we are building toward

**For the agent.** Dropping a file into `content/` is the only action required
to publish. Routes, feeds, relations, twins and indexes are all generated.

**For the public.** A site that reads equally well for a human and for someone
else's agent. There are few of these, and that value does not depend on whether
an autonomous inhabitant ever appears.

**For the maintainer.** A minimal maintenance surface. Everything built by hand
is repaired by hand.

### Two repositories

The engine and the content live apart:

```
oh-my-portal (public)             content (private)
  engine, templates, schema   ←──  dependency, pinned to a tag
  documentation                    content/posts/*.md
  no articles of its own           CI: build and deploy
                                   the agent's token reaches only here
```

This is not tidiness. It turns the agent's permission boundary from a check we
wrote into a credential the platform enforces (§9), and it makes drafts private
by construction rather than by discipline.

The content repository leads, because it changes often while the engine changes
rarely. The engine is consumed straight from git, so nothing has to be
published:

```json
"dependencies": { "oh-my-portal": "github:<owner>/oh-my-portal#v0.3.0" }
```

Bumping the tag is the upgrade. A broken engine commit cannot break publishing:
the content repository keeps building against the previous tag.

*The cost, stated plainly:* the public repository ships with no example content.
Mitigate with a documented schema and a couple of deliberately synthetic posts
under `examples/` — never real articles. The live site is the demo.

## 3. Hard requirements

| # | Requirement | Why |
|---|---|---|
| R1 | Every existing article URL returns 200 at its old address | Organic search is the site's only working distribution channel |
| R2 | `/rss/` keeps working at the same address | Existing subscribers |
| R3 | A way to make contact is visible from any page | Today there is none anywhere |
| R4 | GitHub and projects are visible from any article | Currently invisible to readers |
| R5 | Author block at the end of every article | The moment of peak reader interest |
| R6 | Subscription (email + feeds) | Publishing is rare and unpredictable |
| R7 | Telegram and VK sharing | The audience is Russian-speaking; the current buttons are useless to it |
| R8 | "About" and "Projects" pages | The most-read article leads nowhere; there are many projects, not one |
| R9 | The agent cannot violate R1–R8 | Enforced in CI, not promised in a prompt |
| R10 | Every build emits three outputs: HTML, markdown, `llms.txt` | Not an add-on but the foundation: missing one means the build failed |

## 4. Content model

One type with a `kind` field — simpler for an agent than a hierarchy of types.

```
content/
  posts/<slug>.md        kind: article | note | page
  data/author.yaml       contact, github, bio
  data/projects.yaml     project cards
```

### Frontmatter

Required:

```yaml
title:    "..."
slug:     some-existing-slug
date:     2026-06-21
kind:     article
status:   draft | published
author:   human | being        # see §8
summary:  "One sentence — feeds llms.txt, feeds, and cards"
tags:     [ai, agents]
```

Optional, but what makes the ai-first layer possible:

```yaml
aliases:  [/old-address/]      # URL preservation on rename
updated:  2026-08-14
lang:     ru
tools:                          # what the article covers
  - name: some-tool
    version: "1.5.9"
sources:  [https://...]
related:  [other-slug]
```

The schema is a Zod schema in Astro Content Collections, **validated at build
time**. An agent that drops a file with bad frontmatter breaks the build, not
the site.

### Drafts

A draft lives **in a branch**, never on the production site: the agent pushes
`draft/<slug>`, CI builds a preview at a separate address, the maintainer reads
it on a phone and says "publish". See §7.

A draft never reaches production — not by address, not in feeds.

## 5. Routes

Ghost keeps articles at the root, so the root is taken. Reserved prefixes that
must never be handed out as slugs:

```
/<slug>/            article                    ← R1, flat, as in Ghost
/tag/<tag>/         tag                        ← already exists
/author/<name>/     author                     ← already exists
/page/<n>/          pagination                 ← already exists
/aboutme/           about                      ← already exists, address preserved
/projects/          projects                   ← new, R8
/search/            search                     ← new
/rss/               main feed                  ← R2
/webmentions/…      as-is
```

The ai-first layer (§6) adds `/llms.txt`, `/llms-full.txt`, `/<slug>.md`,
`/<slug>.json`, `/index.json`, `/feeds/<tag>.xml`.

**R1 is a CI test:** a fixed list of existing addresses, each of which must
return 200 against the built site. The build fails, not the traffic.

## 6. The ai-first layer

Not "a site about AI", but a site that is convenient for other people's agents —
the ones their humans launch.

### The rule that sets priority

> Anything that requires people to learn about you in advance will not work.
> Anything that works on habits they already have will.

A typical agent arrives **via one link**, makes **one request**, and leaves. It
does not browse the site, does not see buttons (that is HTML it never renders),
does not guess addresses, and usually does not read `<head>`. Between the site
and the agent there is often a small model that summarises — and versions, flags
and commands are the first things such a summary loses.

### Priority order

**1. Content negotiation on the same URL.** `Accept: text/markdown` arrives, we
return the agent version. This works with no action on the agent's side: coding
assistants already send that header. This is the "hello, here is your version".

**2. The structured core as the first block** — in both versions. It works even
for an agent that asked for nothing, and a human at 1 a.m. prefers it too.

**3. Twins at direct addresses**, so a link can be handed over by hand:

| Address | Serves | Purpose |
|---|---|---|
| `/<slug>.md` | source markdown | text, high fidelity for commands |
| `/<slug>.json` | the `recipe` core + metadata | field-by-field parsing |
| `/index.json` | the whole catalogue in one request | the agent filters locally |
| `/feeds/<tag>.xml` | per-topic subscription | humans and readers |
| `/llms.txt` | site map | because it is cheap |

Plus `<link rel="alternate" type="text/markdown">` for clients that read the head.

### markdown and json are different roles, not a matter of taste

**Prose in JSON costs more than markdown**: escaping, `\n`, syntax noise around
every field. So `.json` carries **not the article as JSON** but the core and the
metadata. Text lives only in `.md`.

### The article core

Facts live in structured form in the frontmatter; the prose is commentary around
them. Both versions are projections of one core, so **they cannot drift by
construction**: the agent version is not derived from the prose.

```yaml
recipe:
  goal: "Tool A behind tool B"
  verified_on: 2026-05-14
  stack: [{name: some-tool, version: "1.5.9"}]
  steps:   [{id: install, cmd: "...", note: "..."}]
  pitfalls: [{symptom: "502 after restart", cause: "...", fix: "..."}]
  do_not:  ["do not enable X together with Y — port conflict"]
```

The agent fills the core: versions, commands and symptoms already sit in terminal
logs and commits. Prose stays with the human. This does not make an article more
expensive to write — it removes the most tedious part.

**Not every article has a core.** A tool guide does; an essay does not. A missing
`recipe` is a normal state, not an unfilled field. The `.md` twin always exists;
the structured package exists where there is something to structure.

The machine version carries the canonical URL and the verification date: it will
be scraped either way, the only question is whether attribution travels with it.

### Not doing

**MCP** — it has to be connected, and nobody will. **OpenAPI** — the same
disease: to use the schema someone must find it and wire up a client. And there
is nothing to describe yet: `/index.json` in one request answers more questions
than any set of parameters, because agents are strong at filtering what is
already in context and weak at multi-step calls.

Revisit when the index stops fitting — i.e. at several hundred articles. That is
a pleasant problem to have: it means the pipeline works.

**Serving bots different packaging is fine; serving different facts is
cloaking.** Googlebot does not ask for markdown and sees ordinary HTML.

## 6a. The thin dynamic layer

Two requirements cannot run on pure static hosting:

- parsing `Accept` and serving the agent version (§6)
- accepting subscriptions (R6)

**Rule: all dynamic behaviour lives in one place — the reverse proxy — and
nowhere else.** If something does not fit there, that is a reason to doubt it is
needed.

In practice: a `map` on the header in nginx (§7) and one endpoint for
subscriptions proxying to an external mail service. We never run our own mail —
deliverability, SPF, DKIM and domain reputation are a separate hobby.

## 7. Technology choices

### Generator: Astro

The deciding factor is **Content Collections with a Zod schema**: frontmatter
validation is built into the generator rather than bolted on as a CI script. That
is precisely the mechanism that makes the agent pipeline safe (§9) — an agent
that writes bad fields breaks the build.

Beyond that: arbitrary endpoints (`src/pages/[slug].md.ts`) give `.md` and
`.json` twins with no gymnastics; `/index.json` is the same kind of endpoint; a
living ecosystem; TypeScript.

*Why not Hugo, though it is several times faster:* its advantages — build speed
and a single binary — pay off at thousands of pages. Here there are a couple of
dozen articles and active engine development, so ease of extension and built-in
schema validation matter more. Redirects for R1 are standard in Astro; output
formats are replaced by endpoints.

*There is no ready base to fork.* Verified: `seite` (the only real AI-native SSG)
has 20 stars, one author, v0.17, a release seven weeks old, and its deploy
targets are all unavailable in the target region. Betting the site on it is not
an option. "Bird CMS" and "EscalateFlow" from various roundups do not exist.

*What to take from `seite`:* triple output by default (R10) and a machine-readable
description of the content model — the latter comes for free, since the Zod
schema **is** a typed specification for an agent.

*MCP — for the authoring side only.* Rejected for readers (§6): it takes effort
to connect and nobody will. But an authoring agent connects it itself, locally,
so the objection does not apply. The gain is modest (an agent already edits
markdown with file tools), so this is ~200 lines over our own `content/` some
day, not a reason to change generators.

### Search: Pagefind

A static index built at build time, working with no server and no database, good
at exact tool names — which is exactly what readers search for. Russian is
supported. No semantics (§11).

### Hosting and deploy

**Cloudflare, Netlify, Vercel and GitHub Pages are all out:** the audience is
primarily in Russia, where those platforms are unavailable or unreliable. This
constraint outranks any convenience.

Static content is radically simpler to host than Ghost: a folder of files behind
a reverse proxy. The public site should sit on hosting with dependable regional
reachability rather than on anything experimental.

### Content negotiation in nginx, no serverless

No edge layer is needed; the reverse proxy does it. The build emits **two trees**
and negotiation is a single `map`:

```nginx
map $http_accept $site_root {
    default            /srv/site/html;
    "~*text/markdown"  /srv/site/md;
}
server {
    root $site_root;
    add_header Vary Accept always;
    add_header Link '</llms.txt>; rel="alternate"; type="text/plain"' always;
}
```

**`Vary: Accept` is mandatory.** Without it any cache or proxy will hand markdown
to a browser and HTML to an agent. That is the most expensive mistake available
in this design.

Subscriptions: a small endpoint on the same server proxying to a mail service
with regional deliverability.

### Previews without external platforms

There are no automatic preview deploys on self-managed infrastructure, so we
build them — roughly 20 lines of CI:

```
agent writes content/posts/<slug>.md → push branch draft/<slug>
  (private repository — the draft is never public)
  → CI builds and publishes to a preview host
    (wildcard vhost, basic-auth, noindex)
  → agent sends the link to Telegram
  → maintainer reads it on a phone, says "publish"
  → agent merges to main → production build
```

*Open question:* where CI runs. A hosted runner (build outside, deploy over SSH)
or a self-hosted one. The first is simpler; the second does not depend on the
hosted service being reachable.

### The `Link` header on every response

The proxy adds `Link: </llms.txt>; rel="alternate"; type="text/plain"` to all
responses. Header-level discovery — the client needs no HTML parsing. Costs one
line.

## 8. Two authors

Disclosing authorship is not a disclaimer but part of the product: if an
inhabitant ever appears on the site, passing its text off as a human's would
destroy the whole point.

The `author: human | being` field drives presentation: a different byline, a
different visual marker, separation in feeds. The reader is never in doubt about
who wrote what.

While there is no inhabitant the field is always `human`, and it costs nothing.

## 9. Agent boundaries

Two layers, in order of strength.

### Credentials first

The agent holds a token for the **content repository only**. Templates, generator
configuration, workflows, deploy settings and secrets live in the engine
repository, which that token cannot reach at all. This is enforced by the
hosting platform, not by code we wrote and could get wrong.

Same principle as everywhere else in this design: impossible by construction
beats trustworthy by intention.

### Path checks second

Inside the content repository, CI still enforces:

- the agent writes `content/**` and nothing else
- frontmatter validates against the schema
- every existing address is still present (R1)
- the R3–R8 elements are in place
- `status` was not flipped to `published` on a file the agent did not author

### Drafts

Because the content repository is private, an unfinished draft is never visible
to anyone. Preview builds run against it; the public sees only what the
published site serves.

These are the same boundaries a future autonomous inhabitant would need, which is
why they are cheaper to install now.

## 10. Order of work

Ghost is left alone — the whole set of R3–R8 elements ships with the new engine.
The ai-first layer is part of phase 1 rather than deferred: it is the point of
the move.

### Phase 1 — migration and ai-first (one release)

**1a. Engine and migration.** Astro, frontmatter schema, existing articles moved
with addresses and `/rss/` preserved, design system (§12), deploy.

**1b. Pages and contact surface.** "About" with contacts (address `/aboutme/`
preserved), "Projects", author block at the end of articles, GitHub links,
Telegram/VK sharing, subscription, per-topic feeds.

**1c. Search for humans.** Pagefind — a static index, no server, good at exact
tool names.

**1d. Ai-first tooling.** Triple output (R10), `.md`/`.json` twins,
`/index.json`, `llms.txt`, content negotiation via nginx `map` with mandatory
`Vary: Accept`, the `Link` header on every response, the structured core as the
first block of an article.

*Done when:* every existing address returns 200, `/rss/` is alive, the build
emits all three outputs, and `curl -H "Accept: text/markdown"` returns markdown.

### Phase 2 — the agent pipeline

The agent writes into `content/`, pushes a branch, CI builds a preview on a
closed subdomain, the link goes to Telegram, publishing is one word. Boundaries
by path in CI. Vectors at build time: related articles, "have I written about
this already?", contradictions with older posts.

### Phase 3 — the inhabitant

An autonomous agent as a resident, `author: being`. Optional.

**The rule for every phase:** switch off everything that comes after — what is
already built must remain useful on its own.

## 11. Not doing

**Comments.** They are moderation, i.e. permanent work, and a small site will get
more spam than comments. They are also useless for the site's purpose: people who
want to reach the author send email, they do not open a discussion thread. A
contact (R3) is cheaper and works. The existing `/webmentions/receive/` is a
separate decision at migration: keep, disable, or serve a stub.

**Semantic vector search on the site.** The corpus consists of proper nouns and
version numbers, and embeddings handle those worse than lexical search:
`some-tool 1.17` and `some-tool 1.19` end up as nearly the same vector. The
volume is also wrong, and runtime semantics needs a database. Site search is a
static lexical index.

**Vectors are useful — but in the pipeline, not on the site**, and entirely at
build time: related articles, a "have I written about this already?" check before
drafting, contradiction detection against older articles. No database, no
endpoint, no runtime.

**Also not doing:** our own CMS with an admin UI, WYSIWYG, agent self-modification
of the site, state dashboards, model debates. Either the reader does not need it,
or it becomes a second job.

## 12. Design system

Minimal, AI-leaning, simple but stylish.

**The visual language:**

- cream background, monochrome, a great deal of whitespace
- monospace for utility text, a text face for prose
- pastel "pills" as section labels
- headings with a coloured background highlight
- utility-style field labels instead of decorative subheadings
- footer as a status line
- no stock illustrations, no gradients, no shadowed cards

**Borrow the typography, not someone else's vocabulary.** Tokens like
`system_prompt`, `context_window` or `<|endoftext|>` belong to the sites that
already use them; reusing them reads as derivative.

**Our vocabulary comes from our own runtime.** The agent runtime this project is
paired with keeps its identity in a soul file: constitution, invariants,
constraints, precedents, commitments, desires. That is working code rather than a
metaphor, and therefore a stronger source of naming.

### Page presentation — open proposals

Not decided, but this is where an evening of invention pays more than a week of
code. The unusual part can live in the **presentation** rather than in the
machinery — and it costs one static page.

- **"About" rendered as our own `soul.md`** — constitution, invariants,
  constraints. Our own vocabulary, grown out of the code.
- **A "now" page.** A proven genre, but everyone maintains it by hand and it goes
  stale. Here it can **update itself**: current work from public repository
  activity, work-in-progress from the issue tracker. The first non-toy use of an
  agent — the reader needs to understand nothing about agents, they simply see a
  page that does not lie.
- **"Projects" as a register** with the state of each project, not a link list.

## 13. How we will know it worked

Two numbers: **articles per year** and **hours per article**.
