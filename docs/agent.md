# Installing the publishing agent

The agent's instructions — the `portal-publishing` skill — live in the content
repository, at `.hermes/skills/portal-publishing/`, because what they carry is
specific to one site. This file is how an engine checkout is made into the
agent's working directory and how that skill reaches it.

What follows is done **once**, by a human, on the machine the agent runs on.
Three steps, each with the check that says it worked, and then the doctor.

## 1. The engine checkout is the agent's working directory

The agent works with the content repository mounted inside the engine, as
`content/`:

```bash
ls content/posts | head          # → about.md, anylogy.md, …
git -C content remote -v         # → oh-my-portal-data
npm run agent:setup              # locked dependencies, LanceDB smoke check, model prefetch
```

**Check:** `node --version` is 22.6 or newer, and `ls content/posts` lists the
corpus. Setup ends with `LanceDB BM25 smoke check passed` and
`Xenova/bge-m3 ready`; the model is cached outside `node_modules`, so later
`npm ci` runs do not download it again. The project root is found by walking up from the session's working
directory to the first `.git`, so a session started outside this checkout does
not see its tools at all — that is the failure this step prevents.

## 2. Point Hermes at the skill

The skill is not in this checkout, so it is not a project-local skill. It is an
**external** one, named in the agent's `~/.hermes/config.yaml`:

```yaml
skills:
  external_dirs:
    - /path/to/oh-my-portal/content/.hermes/skills
```

```bash
hermes skills list | grep portal-publishing
```

**Check:** one line, `portal-publishing`, and a description that says what it
does. A `git -C content pull` then updates the instructions; there is no copy to
drift.

**No other copy may exist.** Hermes resolves a skill name project first, then
`~/.hermes/skills/`, then `external_dirs`, so an old `portal-publishing` in
either of the first two silently wins over the one in the content repository.
Earlier versions of this engine shipped the skill in `.hermes/skills/` and told
you to copy it into the home directory; if you did, remove that copy:

```bash
ls ~/.hermes/skills/portal-publishing .hermes/skills/portal-publishing 2>/dev/null   # → nothing
```

If `content/` is a symlink on this host, name the real directory in
`external_dirs`.

## 3. Broker, environment, hook

The agent does not hold a GitHub token. Requests go through Agent Vault, which
substitutes the real credential for a placeholder on the way out. In the agent's
environment:

```bash
export AGENT_VAULT_ADDR=…        # the broker's API
export AGENT_VAULT_TOKEN=…       # the agent's token for the broker
export AGENT_VAULT_VAULT=…       # the vault holding the GitHub credential
export HTTPS_PROXY=…             # the broker's proxy; git and gh pick it up
export GH_TOKEN=__github_pat__   # a placeholder, not a secret
```

The credential in the vault is a fine-grained token on the content repository
only: `Contents` and `Pull requests`, read and write, and **no** `Workflows`,
`Actions`, `Secrets` or `Administration`. The absences are load-bearing — the
missing `Workflows` scope is what stops the agent rewriting the checks that judge
its own pull requests.

Then the hook, in every checkout the agent pushes from:

```bash
install -m 755 docs/agent/pre-push <checkout>/.git/hooks/pre-push
```

**Checks:**

```bash
printf '%s\n' "$GH_TOKEN"            # → __github_pat__, never a real token
gh api rate_limit --jq .rate.limit   # → a number; the broker substituted
gh api user --jq .login              # → whose credential the broker attached
printf 'refs/heads/x a refs/heads/main b\n' | sh .git/hooks/pre-push; echo $?   # → 1
```

The last one fails on purpose: a push to `main` is publication, and publication
is the maintainer's merge. The hook is a speed bump on the agent's own machine —
it can be deleted — so it is installed, not counted on. The boundary that does
not move is the token's scope and the merge button.

## Doctor

In the order that finds the cause fastest:

| Symptom | Check | Cause |
|---|---|---|
| The skill never loads | `hermes skills list \| grep portal-publishing` | `skills.external_dirs` does not name `content/.hermes/skills`, or names a path that does not exist — Hermes skips a missing directory without a word |
| The skill loads but says something the content repository no longer does | `ls ~/.hermes/skills/portal-publishing` | a stale copy in the home directory wins over `external_dirs`; remove it |
| `gh` answers 401 | `printf '%s\n' "$GH_TOKEN"` | the broker is down, or the egress rule does not cover `api.github.com`. The placeholder is expected; a real-looking token is the bug |
| `npm run embeddings` fails on the import | `ls node_modules/@huggingface/transformers` | `npm run agent:setup` has not completed in this checkout |
| Agent setup fails before the model check | `npm run agent:setup -- --skip-model` | the Node version, locked npm dependencies, or LanceDB native module is unavailable; this path still executes the real Russian BM25 smoke query |
| The model download fails or hangs | `curl -I https://huggingface.co` | the first run needs ~570 MB from `huggingface.co`; after that it is offline |
| A Node install or fetch hangs on `connect`, while `curl` to the same host works | — | Node's address-family auto-selection on this network. `NODE_OPTIONS=--no-network-family-autoselection` fixes it, measured 2026-09-12 |
| `npm run embeddings` is killed with no output, and so is everything else in the session | `systemctl show -p MemoryPeak <the service your session runs in>` | the machine's OOM killer. Measured 2026-09-12: a forward pass padded to 8192 tokens costs 4.3 GB per layer, the kernel killed the whole cgroup twice (8 GB peak, 5.5 GB swap), and the agent went down with it. The generator chunks at 512 tokens for exactly this reason — and while something is being changed there, run it in a capped scope (`systemd-run --user --scope -p MemoryMax=4G …`) so a failure is one process instead of the session |
| `npm run embeddings` computes nothing and you expected work | `npm run embeddings -- --check` | nothing is stale: the hash is of the article's body, and frontmatter edits do not invalidate a vector |

The model is cached at `~/.cache/huggingface/transformers` (override with
`TRANSFORMERS_CACHE`), deliberately outside `node_modules`: transformers.js puts
it inside its own package directory by default, and `npm ci` would then throw
away 570 MB on every dependency change.
