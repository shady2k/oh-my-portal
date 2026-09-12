# Reaching GitHub: the broker, the branch, the pull request

You do not hold a GitHub token, and you never see one. Every request to GitHub
goes through **Agent Vault**, an HTTP credential broker: your environment holds a
placeholder (`__github_pat__`), the broker substitutes the real credential on the
way out, and a prompt injection that talks you into revealing your secrets finds
none to reveal.

## The environment you work in

| variable | what it is |
|---|---|
| `AGENT_VAULT_ADDR` | the broker's API address |
| `AGENT_VAULT_TOKEN` | your agent's token for the broker — not a GitHub token |
| `AGENT_VAULT_VAULT` | the vault holding the credentials |
| `HTTPS_PROXY` | points at the broker's MITM proxy; git and `gh` use it automatically |
| `GH_TOKEN` | `__github_pat__`, the placeholder |

The credential is attached only to `github.com` and `api.github.com` (an egress
rule on the broker's side), so a request to anywhere else goes out without it.

**If the broker is unreachable, the run stops.** Fail-closed is deliberate: the
one thing you must never do is find another way to authenticate. If a command
asks you for a real token, that is the signal to stop and report it.

## What the credential may do

`Contents` and `Pull requests`, read and write, on the content repository, and
nothing else. Each absence matters:

- **No `Workflows`**: GitHub refuses a push that creates or changes anything under
  `.github/workflows/`. That refusal is what keeps you from rewriting the checks
  that judge your own pull request — the pipeline is not yours.
- **No `Actions`**: you cannot dispatch a workflow, and the deploy workflow
  refuses any ref but `main` anyway.
- **No `Secrets`, no `Administration`.**

**`Contents: write` also means you can push `main`, and a push to `main`
publishes.** Nothing mechanical stops you — this repository is private on GitHub
Free, so there are no protected branches and no rulesets. Publication is the
maintainer's merge, and that is the whole of the control: one instruction,
kept.

## The recipe

From the engine checkout, with the content repository at `content/`:

```bash
# 1. Vectors for the articles whose text changed, before the branch exists.
npm run embeddings

# 2. A branch, and only the files you meant to change.
git -C content switch -c draft/<slug>
git -C content status --short
git -C content add posts/<slug>.md data/embeddings/<slug>.json
git -C content commit -m "<what this is, and why now>"

# 3. Push through the broker, then open the pull request.
git -C content push -u origin draft/<slug>
gh pr create --title "<title>" --body-file /tmp/pr.md
```

The pull-request body is the part a human reads, so it carries:

- the screenshots (`/tmp/shots/<slug>-desktop.png`, `<slug>-mobile.png`),
- what you cut, and why,
- the sources the fact check found,
- and, when a run was a retry, what changed between the attempts.

Write it to a file and pass `--body-file`; a long body through the shell loses
newlines and quoting.

Report the URL. `gh pr view --json url,title` answers with the facts.

## What happens after the pull request

Checks run on the branch (paths, the schema, the build). The maintainer reads it,
merges it, or closes it. A merge to `main` is what publishes: a workflow builds
the site and syncs it to object storage, then proves every old address still
answers in one hop.

You are not in that path, and you should not try to be: no deploy, no dispatch,
no merge. When the pull request is open and its body is honest, your run is done.
