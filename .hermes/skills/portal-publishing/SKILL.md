---
name: portal-publishing
description: Draft and open a pull request for the shady2k.ru portal.
version: 0.1.0
author: shady2k, Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [publishing, blog, astro, embeddings, github, pull-request]
    related_skills: []
---

# Portal publishing

Write for shady2k.ru and open a pull request a human merges. The content
repository is mounted as `content/` inside the engine checkout you are working
in; the engine builds the site from it. You draft, you gate yourself
mechanically, you open a pull request — you do not publish. Publication is the
maintainer merging, and a workflow does the rest.

## When to Use

- The maintainer asks for an article, a note or a project page.
- A scheduled run decided something is worth writing.
- An existing article needs a change of substance, a new `alias`, a summary, or
  a project page needs its register brought up to date.

Don't use for:

- Changing the pipeline. `.github/**` is not yours, and your token cannot write
  it anyway.
- Deploying, merging, or dispatching a workflow. None of that is in your reach.
- Editing the engine's own source. That is a different repository with its own
  tracker, and it is public.

## Prerequisites

- Your working directory is the engine checkout and `ls content/posts` shows the
  corpus. The engine's defaults already point into the mount:
  `CONTENT_DIR=content/posts`, `DATA_DIR=content/data`,
  `PROJECTS_DIR=content/projects`.
- `node_modules` exists (`npm ci` has run once). `node --version` is 22.6 or
  newer: the engine's scripts are TypeScript, run directly.
- GitHub is reached **through Agent Vault**: `AGENT_VAULT_ADDR`,
  `AGENT_VAULT_TOKEN` and `AGENT_VAULT_VAULT` are set, `HTTPS_PROXY` points at
  the broker, `GH_TOKEN` holds `__github_pat__`, and git's credential helper
  returns the placeholder. You never hold a real token — if some command wants
  one, the broker is down and the run stops.

## How to Run

Everything runs through `terminal`, from the engine checkout.

## Quick Reference

| What | Command |
|---|---|
| The corpus, and where your idea stands against it | `npm run embeddings -- nearest <slug-or-file> --top 10` |
| Vectors for what you just wrote | `npm run embeddings` |
| Schema, projections, the vitest suite | `npm run verify` |
| A build, exactly as the deploy makes it | `SITE_URL=https://shady2k.ru IMAGES_DIR=content/images npm run build` |
| A server to look at it through | `npx astro preview` (serves `dist/` on `127.0.0.1:4321`) |
| Your page, desktop and phone | `npm run screenshot -- --out /tmp/shots --path /posts/<slug>/` |
| Your branch, in the content repository | `git -C content switch -c draft/<slug>` |

## Procedure

Each step ends with what proves it finished. Steps 5–7 loop back to 4 — **two
attempts**; after that the idea is parked with the reason it failed and does not
block the next run.

1. **Pull, in the content repository.** `git -C content pull`.
   *Done when* `git -C content status --short` is empty.

2. **Read the corpus from disk, not from the site.** `content/posts/`,
   `content/projects/`, `content/data/embeddings/`. The repository is always
   ahead of the site: it holds drafts that were never published and merges the
   CDN has not served yet. *Done when* you can name the three closest existing
   articles with their cosines, from
   `npm run embeddings -- nearest /tmp/idea.md --top 10` (or a slug).

3. **Decide the idea — or decide there is none.** A run that finds nothing worth
   writing is a successful run; an article every time you wake up is how the
   maintainer stops opening them. *Done when* the idea is not within 0.05 cosine
   of an existing article's subject; if it is, write the update to that article
   instead, or stop.

4. **Plan.** The claim, what supports it, what is out of scope. *Done when* it
   exists as a file you could hand to someone.

5. **Write it** into `content/posts/<slug>.md`, or
   `content/projects/<slug>.md` for a project page. `kind: note|article` is your
   choice. `author` is not: `human` when the maintainer asked for this, `being`
   when nobody did. The way you were invoked decided it — never revisit it.
   *Done when* `npm run verify` is clean.

6. **Fact check, with search.** Fill `sources`. A claim with nothing behind it is
   softened to what can be supported, or cut together with its paragraph.
   *Done when* every claim a search could check has a source.

7. **Build it and look at it.**
   `SITE_URL=https://shady2k.ru IMAGES_DIR=content/images npm run build`, then
   `npx astro preview` in the background, then
   `npm run screenshot -- --out /tmp/shots --path /posts/<slug>/` — desktop and
   phone, and it fails on a non-200, a broken image, a font that did not load or
   a page wider than its viewport. *Done when* you have looked at both files and
   the R10 outputs exist.

8. **Open the pull request.** `npm run embeddings` for the vectors your text
   needs, then, in the content repository: `git -C content switch -c draft/<slug>`,
   `git -C content add` the files you meant to change, commit, `git -C content push -u origin draft/<slug>`,
   and `gh pr create --title "<title>" --body-file /tmp/pr.md`. The body carries
   the screenshots, what you cut and why, and the sources.
   *Done when* the pull request URL exists and its body shows the screenshots.

## Never

- **`git push origin main`, `git push --force`, or any merge.** You have
  `Contents: write` — a branch push requires it — which means you *can* push
  `main`, and a push to `main` publishes without review. Nothing mechanical stops
  you: this sentence is the control. Publication is the maintainer's merge.
- **Editing `.github/**`.** GitHub refuses it without the `Workflows` scope, and
  it is the pipeline that judges your pull requests.
- **Handling a real secret.** You hold `__github_pat__`, and that is all. If a
  command needs a real token, the broker is down: stop.
- **`status: published` on a draft you cannot support**, or a
  `status` flip on someone else's file.

## Pitfalls

- **A draft is not a preview.** `status: draft` never reaches production — not by
  address, not in feeds. The branch is the only home a draft has.
- **The `slug` is the address, not the file name.** Renaming the file changes
  nothing; changing `slug` moves the address, and then the old one must go into
  `aliases` or a reader's link dies.
- **A build without `SITE_URL` fails on purpose** (`check-outputs.ts`): pages
  whose canonical names `example.com` are worse than no canonical. For a local
  build with no address, `CHECK_PLACEHOLDER_HOST=allow`.
- **A build without `IMAGES_DIR` fails too, and for the same kind of reason.**
  The articles' pictures live beside them in `content/images/` and are copied into
  the build by an integration that reads that variable; without it every picture
  on the page is broken and `check-outputs.ts` refuses the build, naming them.
  This is the one step the deploy does that is easy to forget locally — and if you
  build without it and ignore the failure, the screenshots will show a page with
  holes in it.
- **`astro preview` serves `dist/`**, so it shows the last build. Run
  `SITE_URL=https://shady2k.ru IMAGES_DIR=content/images npm run build` after
  every edit you want to look at.
- **Always pass `--path`.** `screenshot.ts` without it shoots a fixed list — the
  engine's own example articles, `/about/`, `/archive/`, a tag page — which is
  right for the engine's test content and wrong for this corpus: most of those
  addresses are not here, and each one answers nothing, so the run fails instead
  of showing your page.
- **A post with no vector does not fail the build.** It renders without the
  neighbours block and `check-outputs.ts` lists it. That is deliberate: related
  posts are an ornament, R10 outputs are the contract.
- **The first `npm run embeddings` downloads ~570 MB** into the transformers
  cache. Later runs are offline, and only the changed articles are recomputed.
- **The model pads to 8192 tokens unless it is stopped from doing so.**
  `feature-extraction` hands the tokenizer `{ padding: true, truncation: true }`,
  and bge-m3's `model_max_length` is 8192; one layer's attention at that width is
  4.3 GB, and a run like that takes the machine's session down with it (measured
  2026-09-12: the kernel OOM-killed the whole agent stack, twice). That is why the
  generator calls the model directly, chunks at 512 tokens and averages. Do not
  "simplify" it back to one pass per article.
- **If a run dies with no output at all**, memory is the first suspect, not the
  model: check what the session's cgroup peaked at before re-running.
- **`migration/**` is a closed set** (49 addresses) applied indefinitely. Read
  `references/redirects.md` before touching it.

## Verification

Before opening the pull request, every one of these is true:

1. `npm run verify` — `astro check` reports 0 errors and the vitest suite passes.
2. `npm run build` — Astro, Pagefind and `check-outputs.ts` all succeed, which is
   the schema gate, the R10 gate and the placeholder-host gate at once.
3. `/tmp/shots/` holds your page at desktop and phone width, and you looked.
4. `git -C content status --short` lists only the files you meant to change —
   and one `data/embeddings/<slug>.json` per article whose text you changed.
5. `gh pr view --json url,title` answers, and the body carries the screenshots.

## References

- `references/schema.md` — the frontmatter and project fields, with their rules.
- `references/redirects.md` — `migration/`, R1, and when `aliases` is the answer.
- `references/publish.md` — the broker, the placeholder, and the pull request.
