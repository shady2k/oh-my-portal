# oh-my-portal — engine design

A publishing engine for a personal site, replacing Ghost. Two goals: make an
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
| R1 | Every existing article URL 301-redirects, in a single hop, to a new address that returns 200 | Organic search is the site's only working distribution channel |
| R2 | `/rss/` keeps working at its original address, not via a redirect | Feed readers handle moved feeds badly |
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
  posts/<slug>.md        kind: article | note | page; `project` names a project
  projects/<slug>.md     one project: the register in frontmatter, its page in the body
  data/author.yaml       contact, github, bio
```

A `kind: page` entry has its own address — `about` renders at `/about/`, not at
`/posts/about/` — so pages appear in neither the listings nor the feeds. That is
the only thing separating them from articles; they are still one type.

The engine finds this tree through `CONTENT_DIR`, `PROJECTS_DIR` and `DATA_DIR`.
It ships none of them: `examples/posts`, `examples/projects` and `examples/data`
hold obviously synthetic values so the engine builds on its own and so the shape
is visible to someone reading the repository.

### The site's own data

`data/author.yaml` is validated by the same kind of schema as the frontmatter
(`src/schema/site.ts`), and is just as strict.

```yaml
# data/author.yaml
name:     "..."
bio:      "One or two sentences — ends every article (R5)"
contact:  { label: "...", href: "..." }   # exactly one: R3
links:    [ { label: github, href: "..." } ]   # R4
subscribe_action: /subscribe/             # where the form posts (R6); optional
```

`contact` is one entry rather than a list on purpose: six ways to reach someone
is a way of not being reachable.

### Projects

A project is a markdown file, `projects/<slug>.md`, whose file name is its slug.
Its frontmatter is the register (`src/schema/project.ts`, strict); its body is
the project page's own prose.

```yaml
title:   "..."
slug:    some-project           # equals the file name; `index` is reserved
status:  draft | published
lang:    ru
state:   active | maintained | experiment | paused | archived
summary: "..."
since:   2026-09-01             # when that state was last true
stages:  [ { title, state: done | current | next, post? } ]   # 2..5, optional
question, observation, featured, sketch, repo, site            # optional
```

`state` is what makes a project worth listing — a list of repository links says
nothing a profile page would not, and it goes stale without a reader being able
to tell, while "archived since 2024" is still true a year later.

A post names its project with `project: some-project`, or several with
`project: [some-project, other-project]` when it is about more than one; each
named project's page lists it. The machine versions (`.md`, `.json`,
`/index.json`) always carry the list, as `projects: [<address>, ...]`, so a
parser meets one shape. The build refuses a post naming a project it does not
publish, a stage whose post names another project
or none, a second featured project, a slug that differs from its file name, and
a leftover `data/projects.yaml`.

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
tags:     [ai, agents]     # may be empty: a tag earns its place by grouping
lang:     ru               # authoritative for hreflang, llms.txt, /index.json
```

Optional, but what makes the ai-first layer possible:

```yaml
aliases:  [/old-address/]      # URL preservation on rename
updated:  2026-08-14
tools:                          # what the article covers
  - name: some-tool
    version: "1.5.9"
sources:  [https://...]
related:  [other-slug]
project:  some-project          # or [a, b]: the projects this entry belongs to
```

The schema is a Zod schema in Astro Content Collections, **validated at build
time**. An agent that drops a file with bad frontmatter breaks the build, not
the site. It is a `strictObject`: an unknown key fails too, so an invented field
is caught rather than silently ignored.

It lives in `src/schema/frontmatter.ts` as plain Zod, and `src/content.config.ts`
is only the Astro binding. That split is what lets the content repository's CI
checks (§9) and the agent tooling (§10, 1d) import the same schema without
booting Astro — one definition, three consumers.

### Drafts

A draft lives **in a branch**, never on the production site: the agent pushes
`draft/<slug>`, CI builds a preview at a separate address, the maintainer reads
it on a phone and says "publish". See §7.

A draft never reaches production — not by address, not in feeds.

## 5. Routes

### We do not inherit Ghost's URL shape

Ghost keeps articles at the root, and its slugs are transliterated Russian
(`sovriemiennaia-zashchita-domashniei-laboratorii`). Both are inherited
accidents, not decisions. Carrying them forward would occupy the root forever
and freeze unreadable slugs into the new site.

Instead we design a scheme and **301-redirect every old address to its new
one**. This is the only migration we get; retrofitting a path shape later means
doing it all again.

```
/                   index
/posts/<slug>/      article
/tag/<tag>/         tag
/about/             about
/projects/          projects
/projects/<slug>/   project page
/search/            search
/rss/               main feed          ← R2, original address, never redirected
/llms.txt           site map for agents
/sitemap.xml        site map for crawlers
/robots.txt         crawler policy, and it points at both maps
/index.json         catalogue
/webmentions/…      as-is
```

`/sitemap.xml` lists only what is indexable, so `/search/`, the 404 and
`/posts/<slug>/integrity/` are absent — each of them already carries `noindex`,
and submitting an address you asked not to have indexed is a contradiction a
crawler resolves against the site.

Freeing the root of *articles* is the point: Ghost put them at bare root, so
sections competed with slugs. `/posts/` solves that. New top-level pages now
cost nothing.

`/aboutme/` gets no special treatment: it is content, so it moves to `/about/`
and redirects like everything else. "It is already indexed" is true of every
address here, and every address is being redirected anyway.

### Language: the default locale is not prefixed

Astro's recommendation, and it is the right one here:
`prefixDefaultLocale: false` — the default language has no prefix (`/about/`),
additional languages do (`/en/about/`).

An earlier draft of this document argued for `/ru/` from day one, on the
grounds that adding a language segment later would force a second migration.
**That argument was wrong.** With the default locale unprefixed there is no
second migration either: Russian keeps its addresses forever and English, if it
ever appears, arrives at `/en/` without touching a single existing URL.

What is left is genuine upside: shorter addresses for the language that carries
effectively all the traffic, and the framework's happy path instead of custom
routing.

`lang` stays authoritative in the frontmatter, `hreflang` is emitted per page
with `x-default` pointing at the unprefixed tree, and `/index.json` and
`llms.txt` carry the language of each entry.

### The head states the same facts twice

§6 gives an agent `llms.txt`, a markdown twin and `/index.json`. None of those
is read by a search engine or by the thing that unfurls a link pasted into a
chat window, so the head repeats the same facts in the two vocabularies those
clients do read: Open Graph and Twitter card meta, and `schema.org` JSON-LD
(`BlogPosting` on an article, `WebSite` plus `Person` on the index,
`BreadcrumbList` on anything nested).

Nothing there is a new fact. Every field comes from the frontmatter or from the
site data, which is what keeps the three representations from disagreeing — and
means a field that is absent stays absent rather than acquiring a placeholder.
§8 is the sharp case: an article the inhabitant wrote carries no author in the
machine-readable metadata at all, because the only name available to put there
is the maintainer's, and that is precisely the substitution §8 exists to
prevent.

`<title>` leads with the page and ends with the site's name, since a search
result and a browser tab both truncate from the right. The index inverts it: the
site is the subject there, so it leads with the name and follows with the
headline.

The social card is one static image for the whole site, built by
`scripts/og-card.ts` from the same tokens and faces the pages use. Per-article
cards wait on the image pipeline, which does not exist yet.

### Redirect rules

**Astro's `redirects` config is not used for the migration.** The docs are
explicit: `astro build` "will output HTML files with the meta refresh tag by
default", and "if building to HTML files the status code is not used by the
server". Only supported adapters write real host configuration — and those
exist for platforms ruled out on regional reachability (§7).

So the redirect map is a **data file**, and a build step emits nginx
configuration from it. One source of truth, real status codes, and no dead
meta-refresh pages littering the output. This is another reason the nginx
deployment earns its keep.

`migration/redirects.yaml` is the map; `scripts/gen-redirects.ts` renders it to
`nginx/redirects.conf`, which is **committed on purpose** — a diff on it is the
review of a change to production routing. `npm test` fails if it is stale. The
output is exact-match `location =` blocks rather than a `map` plus `if`, and
each old address is emitted in both its slashed and unslashed form so a link
that lost its trailing slash still arrives in one hop.

- **301, never 302.** A permanent redirect passes ranking signal; a temporary
  one does not.
- **One hop.** Old address → final address, directly. Never through an
  intermediate. Chains lose signal and are the usual way this goes wrong.
- **Every old address is covered.** The map is exhaustive and pinned in a test.
- **`/rss/` is the only exemption**, and for a mechanical reason rather than a
  sentimental one: feed readers deal with moved feeds unreliably and some drop
  the subscription silently. It keeps serving at its original address.

### Slugs

Since every address is being redirected anyway, slugs are rewritten now — this
is free at migration time and expensive at any other. New slugs are short,
lowercase, and readable; they name the subject rather than transliterating a
headline.

### The CI test

Two assertions per old address, not one:

1. the old address returns **301**, with `Location` pointing at the new address
2. the new address returns **200**

Plus: no redirect target is itself a redirect. The build fails, not the traffic.

The ai-first layer (§6) adds `/llms.txt`, `/llms-full.txt`, `/posts/<slug>.md`,
`/posts/<slug>.json`, `/projects/<slug>.md`, `/index.json`, `/feeds/<tag>.xml`.

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

> **Not implemented, and not pending.** The site is served from object storage
> behind a CDN, which has no request-time logic; this is the one item on the list
> that a static host cannot do at all. It is ranked first because it is the most
> valuable, and it stays first so that anyone weighing a future move away from
> object storage can see what the move would buy. See
> `docs/decisions/ADR-0001-no-accept-negotiation.md`. Items 2, 3 and 4 are all
> built, and they are what the ai-first layer actually consists of today.

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

**One** requirement cannot run on pure static hosting: accepting subscriptions
(R6). One endpoint, proxying to an external mail service. We never run our own
mail — deliverability, SPF, DKIM and domain reputation are a separate hobby.

**Rule: dynamic behaviour is one endpoint and nothing else.** If a second one
appears, that is a reason to doubt it is needed rather than a reason to build a
place for it to live.

*An earlier version of this section listed a second requirement — parsing
`Accept` and serving the agent version on the same address — and phrased the
rule as "all dynamic behaviour lives in the reverse proxy". Both are gone, and
the reason is recorded in `docs/decisions/ADR-0001-no-accept-negotiation.md`:
the site is served from object storage behind a CDN, which has no request-time
logic to put a `map` in. The `Accept` half of §6 is **not implemented**. Every
other part of §6 is: the twins keep their own addresses, `llms.txt` is served,
the `<link rel="alternate">` is in every head, and the CDN adds the `Link`
header. What is lost is the version that required no cooperation at all.*

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

Static content is radically simpler to host than Ghost: a folder of files. The
public site sits on hosting with dependable regional reachability rather than on
anything experimental.

**Decided: S3-compatible object storage behind that provider's CDN.** No server
of ours runs anywhere. The CDN is not an accelerator here, it is load-bearing —
it terminates TLS for the custom domain, and it is the only place that can add a
response header.

Measured against a live bucket rather than read from documentation, because the
documentation was wrong twice (`br` issue `vk-hosting-findings-vn2` has the
detail):

- Index documents **are** substituted in subdirectories, so `trailingSlash:
  'always'` and `build.format: 'directory'` survive intact. This was the one
  finding that could have forced §5 to change.
- Public read needs **both** a bucket policy granting `s3:GetObject` and a
  `public-read` ACL on the objects. Neither alone is enough, and the failure is
  asymmetric: with only the policy, every subdirectory works and the front page
  returns 403.
- An explicit `Content-Type` at upload survives, so the markdown twins keep
  `charset=utf-8`. Without it they arrive as mojibake — the same failure the
  nginx template had to fix.
- A missing address returns **403, not 404**, though the configured error
  document is what gets served. Open; the CDN may be able to rewrite it.

*What this costs:* content negotiation on `Accept` (§6, item 1) is not possible
and is not implemented — `docs/decisions/ADR-0001-no-accept-negotiation.md`.

### Content negotiation in nginx — not our deploy, kept for whoever self-hosts

**This subsection describes a path this site does not take.** It stays because
the engine is a public product: someone running it behind their own nginx gets
negotiation for free, and `nginx/site.conf.example` is a working configuration
they can copy. Nothing below is true of the deployment described above, which
serves from object storage and cannot look at a request header at all.


No edge layer is needed; the reverse proxy does it. Negotiation is a single
`map`, and it swaps the **index file** rather than the document root:

```nginx
map $http_accept $site_index {
    default            index.html;
    "~*text/markdown"  index.md;
}
server {
    root /srv/site;
    try_files $uri $uri/$site_index =404;
    types { text/markdown md; }
    add_header Vary Accept always;
    add_header Link '</llms.txt>; rel="alternate"; type="text/plain"' always;
}
```

*An earlier draft of this section emitted two trees and swapped `root` between
them.* The behaviour is identical and the cost is not: `astro build` writes
`index.html` and `index.md` side by side for every address, so one tree means one
deploy and no second copy of the site that can fall out of step with the first.

What makes the swap safe is a gate rather than care: under it, an address whose
directory has no `index.md` is a 404 **for agents only** — invisible in a browser,
and therefore invisible in review. `scripts/check-outputs.ts` fails the build on a
missing twin, which is R10 stated as something a machine checks. The live
assertion, that a real server returns markdown for `Accept: text/markdown` and
sets `Vary` on the response, belongs with the redirect tests against a running
deployment.

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
- every old address still resolves through the redirect map (R1)
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

**1b. Pages and contact surface.** "About" with contacts at `/about/`
(`/aboutme/` 301s to it), "Projects", author block at the end of articles, GitHub links,
Telegram/VK sharing, subscription, per-topic feeds.

**1c. Search for humans.** Pagefind — a static index, no server, good at exact
tool names.

**1d. Ai-first tooling.** Triple output (R10), `.md`/`.json` twins,
`/index.json`, `llms.txt`, the `Link` header on every response, the structured
core as the first block of an article.

Content negotiation on `Accept` was the first item here and has been dropped:
the deploy is object storage, which has no request-time logic
(`docs/decisions/ADR-0001-no-accept-negotiation.md`). Everything else in this
phase is unaffected — the twins were never generated by the proxy, they are
build outputs.

*Done when:* every old address 301s in one hop to a new address that returns
200, `/rss/` still serves at its original address, the build emits all three
outputs, and each twin resolves at its own address with `charset=utf-8`.

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

### Dark theme (2026-09-10)

The maintainer approved a dark variant: warm graphite, soft light ink, muted
secondary text and a lighter red editorial accent. Both palettes are paired in
`tokens.css`; type, spacing and component structure stay the same. The header
selector offers Auto, Light and Dark. Auto follows the system, including without
JavaScript. Explicit choices persist and apply before first paint.

Raster drawings retain a dimmed light paper surface and their original red marks.
SVG rules and RSS drawings follow the page ink. Code colours use semantic tokens
in both themes. The UI kit previews these same components and theme preferences.

### Shared UI kit (2026-09-10)

The component contracts and live catalog are maintained in
[`src/components/ui/README.md`](../../src/components/ui/README.md). Run `npm run ui`
and open `/_ui/` on port 4324. The catalog renders the same Astro components as
real pages and is absent from ordinary production builds. Storybook is not a
runtime dependency; the catalog covers this site's current component states.

All pages share one `--frame` outer shell, including projects, about and search.
Readable prose is constrained to `--measure` inside it. Page headings,
observations, project/home editorial columns, image size and footer use shared
components and tokens. Project art is bounded, not expanded to the prose width.

Drawing and caption open one native modal with the authored annotations intact.
Escape, close button and backdrop dismiss it; focus returns to the trigger.
The underlying links open the original image when JavaScript is unavailable.
The shared footer uses the configured author's name and contact, the build year,
about and RSS links. Publication licenses are not inferred from the engine's license.

The opening headline has a brief typing effect with a square cursor. Reserve its
full dimensions before animating, expose the complete text to assistive technology,
and show static text with reduced motion or without JavaScript. Cursor blinking
stops after three cycles. Omit a single terminal period in this display heading;
retain question/exclamation marks and ellipses. Body text and source projections
keep their original punctuation.

### Page jump (2026-09-11)

An article carries two floating controls at the bottom right of the frame: ↑ to
the site header and ↓ to the neighbouring-articles block. Each shows only while
it is useful — ↑ once the article's header has left the screen, ↓ until the end
block arrives — so a short article shows neither. They are plain fragment
links, so Back returns the reader to where they were, and the jump is instant.
Without JavaScript nothing floats.

The targets are `#page:top` and `#page:end`. The heading slugger strips `:`, so
no heading can take either id; `test/pages.test.ts` keeps fixture headings of
those names to prove it.

`oh-my-portal-wmo` prescribes a static contents block first and a floating
control only once the static one is found wanting. For up and down the
maintainer chose the floating control directly, with its cost stated: a widget
over the text, a script, and on a phone the right end of the bottom two lines
covered while it shows. The contents list itself remains `wmo`.

### Approved field journal direction (2026-09-09)

The maintainer selected the light field journal concept. This decision supersedes
the earlier visual prescription below: warm off-white paper, large sans headings,
one red editorial accent, fine rules and contextual notes in a wide margin.
Tags are neutral labels (outlined at first; unboxed words since the quiet pass). The header carries the configured author name;
the homepage opening uses optional `author.headline` and the existing bio.

The opening is compact enough to reach actual writing quickly. The newest post
leads; an active or experimental project from the existing register accompanies
it. These are labelled as the latest post and a project in the workshop, never
inferred claims about what the author is doing now. The archive retains dates,
summaries, topic links and exact Markdown sizes. A resident section appears only
when a published resident post exists. No invented quotations or telemetry.

Article marginalia carry actual verification/update dates and a direct Markdown
link for a reader handing the article to an agent. This visible handoff is an
intentional exception to the previous rule against machine links in the UI.
At narrow widths the margin moves below the article; reading and copy controls
remain usable without horizontal page scrolling. Illustrations are optional
content that must explain a real experiment, not a mandatory decoration slot.

Personal names and real projects remain in the separate content repository;
the engine demonstration continues to use explicitly synthetic content.

### Illustrated composition

The workshop spread now uses a compact introduction with a direct jump to the
journal, an explicitly selected experiment with its linked current stage and an
authored observation, three latest entries,
and one dated before/after revision. `/archive/` keeps the complete journal
accessible. This supersedes automatic pitfall marginalia: changes of mind are
authored in the original article, not inferred from troubleshooting data.
See [the content contract](../workshop-content.md) for optional fields, validation,
fallbacks and the publication workflow.

Visible editorial dates use Russian month names (`8 сентября`, unpadded since the quiet pass below), with full dates
on homepage entries and detail pages. UTC
keeps the displayed day aligned with ISO `datetime` and unchanged machine data.
The homepage archive is compact: date and kind share a left margin, followed by
title and authored summary. On phones the metadata sits together above the title. Tags and
byte sizes remain available in topic listings and articles. The SVG center label has
a paper-coloured outline so connecting strokes do not cross its lettering.

The illustrated revision restores the approved concept's composition: an active
or experimental project leads the homepage, with a bounded pencil illustration
alongside it. The complete stage timeline lives on the projects page; the home
overview shows only the current stage, avoiding a duplicate status badge. The
illustration caption is a readable link to its original. A small inline drawing
of an open journal with RSS waves accompanies the subscription link. It is
decorative and hidden from assistive technology; the adjacent text names the
feed at `/rss/index.xml`, which also works in local preview without nginx's
`/rss/` alias. These two scales of illustration leave recent writing visually prominent.
Projects may supply `question` and `sketch: {center, labels, caption}`; labels are
exactly four short strings. The caption describes the diagram accessibly and
travels into both the homepage and project Markdown projections. Missing project
data falls back to the latest post; missing sketch data does not invent a figure.
The archive has a separate margin containing a sourced pitfall and its solution,
linked back to the article. On phones the illustration remains visible and the
margin follows the list. Example projects remain explicitly synthetic.

The September 10 refinement keeps the opening biography intact in a wider,
more compact introduction, with the journal jump directly below it. Structural
labels are quiet sentence case; only the small journal masthead remains uppercase.
Red marks identify the authored observation, drawing annotations and the revised
position. The before/after insert has a graphite SVG separator and one red
underline, without a redundant revision stamp or arrow. Space separates the
remaining sections; pencil borders do not wrap every block. The existing
experiment illustration and small RSS drawing provide the two illustration
scales without additional decorative images. On phones the drawing follows the
experiment summary, before its detailed observation.

The pencil-border review keeps the compact journal's graphite separators but
removes enclosing frames: the experiment ends with a light pencil line, and a
short stroke introduces the whole revision section, including its explanation.
Removing the frame padding restores the shared text alignment, while a smaller
gap after the latest entries brings the revision closer to the journal.
Non-scaling strokes retain their weight on phones; decorative SVGs do not
intercept links and are hidden from assistive technology. Each visual variant
is saved in a separate local commit for comparison and rollback.

The typography refinement aligns the experiment copy with the top of its drawing
and tightens the introduction gap. The journal heading has no lower rule; space
leads into the first entry, and pencil separators remain between entries.
Experiment descriptions use 18px text; compact entry summaries and the revision
explanation use 17px. Dates and other metadata keep their smaller size.

Prose uses self-hosted IBM Plex Sans Variable (100–700, normal and italic), and
utility text uses IBM Plex Mono (400/700). Both include Latin and Cyrillic subsets,
with system fallbacks and `font-display: swap`. The eight WOFF2 assets total
204,688 bytes; ordinary Sans/Mono text in both scripts requests 98,288 bytes.
Other styles load only when used. Sources, versions and licenses are recorded in
[`src/assets/fonts/README.md`](../../src/assets/fonts/README.md).

Homepage internal navigation uses plain underlined links; the downward arrow is
reserved for the jump to the journal. Illustration enlargement has a small
magnifier, a zoom cursor and a linked caption that responds to image hover/focus.
The experiment summary and observation both use 18px text, with the observation
in dark ink. The RSS invitation is an 18px semibold link with the short explanation
"Новые записи через RSS." Keyboard focus keeps the shared visible outline, and
the experiment heading underlines on focus as well as hover.

The rank review (2026-09-10) gives the homepage three levels instead of one.
The feature title drops to 27–34px so the page headline is the single dominant
voice on the first screen, and the biography takes a 44rem measure rather than
the full frame. The project's open question leaves the illustration rail — where
it read as a footnote to the drawing and stretched that column past the copy,
leaving a dead zone under the read link — and becomes the experiment block's own
closing line across the full width. A change of mind is a sunk insert: paper one
step darker, its own air, and no rule, because next to the journal listing the
same graphite hairline every block uses gave the page's most distinctive content
the rank of a row of links. The insert bleeds into the page gutter by what the
gutter has to spare, so its text keeps the shared left alignment; on a phone the
gutter is the whole margin and the insert runs edge to edge. Inside an article a
revision keeps the plain form with its pencil rule — the piece around it already
supplies the context the ground would otherwise have to. Compact entry dates get
a margin the width of the longest date instead of two rem more. Both
illustrations stay.

The quiet pass (2026-09-10, later the same day) removes devices rather than
adding any. The screenshot review found the field-journal concept sound but
speaking in too many voices at once, and each cut below has one reason.

- **Labels.** Editorial labels are set in the prose face, small and quiet;
  the monospace face is reserved for data — dates, sizes, tags — so a label
  never looks like a value. The one exception is the uppercase journal masthead,
  which is a stamp on the cover. The project's open question keeps the page's
  only italic and carries a quiet label: without one, a reader took the
  sentence for a stray line (2026-09-11). The experiment label
  and its stage share one line, without a coloured dot. The topics row is
  labelled "Темы журнала".
- **Red.** Red is the author's hand and nothing else: the observation bar, the
  drawing annotations and the underline beneath the revised position. The theme
  control marks its active choice in ink; the observation's label is quiet ink,
  because the bar beside it already carries the mark. Keyboard focus keeps the
  accent outline — it is an interaction affordance, not a design mark.
- **Rules.** The pencil stroke is the page's one hand-drawn rule, spent on the
  seam between the experiment and the journal. Everything else — rows, the
  revision, the footer — parts with the same straight hairline. Repeating the
  stroke between rows had turned a mark into a pattern.
- **The revision insert** loses its sunk ground and sits on the page paper,
  aligned to the shared text edge, introduced by a straight rule and air. This
  supersedes the rank review's pasted-slip ground: a full-width band was the
  heaviest mass on the page and competed with the illustration, which is the
  content and should be the one bold thing. The insert still outranks a listing
  row by scale — its comparison is the largest text below the headline. The
  `--paper-sunk` token remains for other consumers.
- **Details.** Visible dates drop the leading zero (`8 сентября`): a person
  writes the day that way, a machine pads it; tabular figures keep the listing
  aligned. The journal head links to "Весь журнал" without a count. Tags are
  underlined words in the data face with a quiet count, not boxed chips, and the
  kind beside the size in full listings is likewise unboxed — nothing in the
  metadata wears a frame.

### Previous direction (historical rationale)

**One loud object, and a quiet page under it.**

The front page opens on the site's name with the corpus split into coloured
counts beneath it. That row is the identity and the filter at once, every number
in it is an article count, and its shape tells a reader what the site is about
before they read a word. Everything below it is set quietly so that object keeps
working.

*Earlier drafts of this section described a cream editorial page, and then a
terminal frame. Both were replaced after they were built and looked at. The
cream page spent its colour on a highlight behind headings and pastel pills that
labelled nothing; the terminal page spent its structure on a status line, file
paths, reading times and a row of machine addresses — seven pieces of furniture
around two articles, each defensible on its own and collectively louder than the
writing. What survived from both is below.*

**The visual language:**

- near-white ground with a hair of violet, ink, hairline rules; no gradients, no
  shadows, no illustration slots
- one sans for everything a person reads; monospace only for what a machine
  produced — dates, sizes, paths, code
- colour means exactly one thing: a tag. Six pastels, and a tag keeps its colour
  on every page it appears, so the colour becomes a second name for it
- the archive is three zones — when, what, how much — with the metadata gathered
  at the right edge and the writing alone in the middle
- one real measurement per row, and only one
- headings carry themselves with size, weight and space
- a search hit inverts rather than tints, because every tint already means "tag"

**The one number, and why it is that one.** Each row shows the exact byte length
of the markdown twin the build emits for that article — the same string, from the
same function, not an estimate of it. It is the one figure this site can put
beside an article and mean completely: it is what somebody else's agent will
actually fetch (§6). Kilobytes of markdown rather than tokens, because a token
count needs a tokenizer and would still be a guess about whose.

**Code is set on the page, not on a slab from somewhere else.** Astro's default
is Shiki with `github-dark`, which drops a dark block into a near-white page in
colours nothing else here can reach. Ours is the tag palette darkened until it
is text: the same six hues carry code that carry topics, so a block belongs to
the article around it. The scopes are deliberately few — a theme with forty rules
distinguishes things a reader of a homelab article never needed distinguished.
Long lines wrap with a hanging indent rather than scrolling or widening the
block. A wrapped shell line would read as two commands — the indent is what
prevents that, and it is why wrapping is acceptable here at all. Scrolling hides
the end of the very thing a reader came for, and a block wider than the column
costs the page its left edge, which on a text-first site is the worse trade.
Every code block sits in the reading column, like everything else. The colours live in `src/styles/code-theme.ts`, the only place in the
engine that names a colour outside `tokens.css`, and they are there because Shiki
emits them inline and cannot read a custom property.

**Nothing rendered that is not real.** Every value in the chrome is a frontmatter
field, a piece of site data, or a build-time computation. The design borrows the
form of instrumentation, and that form is worth nothing if the figures are
invented — a value that cannot be computed is omitted, never filled with
something plausible.

**The machine surface stays off the page.** An agent never renders this HTML: it
reads `<link rel="alternate">` in the head, follows the `Link:` header the CDN
adds, or goes straight to a twin address listed in `llms.txt` (§6). A visible row
of links to twins reaches none of them and costs every human reader a line.

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
