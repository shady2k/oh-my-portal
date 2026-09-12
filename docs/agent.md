# Installing the publishing agent

The agent's instructions live in this repository — `publishing.md` §2 in the
content repository explains why: its token can write the content repository, so
instructions kept beside the articles are instructions the same token can
rewrite. Here it cannot reach them at all.

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
not see the skill at all — that is the failure this step prevents.

## 2. Trust the checkout, so the skill loads

Skills come in two tiers here: the agent's home directory
(`~/.hermes/skills/`) and the **project-local** directory of the checkout the
session runs in (`.hermes/skills/`, or `.agents/skills/`). The publishing skill
is project-local, because that is versioned with the engine and reachable only
where the token cannot write:

```bash
hermes skills trust /path/to/oh-my-portal
hermes skills list | grep portal-publishing
```

**Check:** one line, `portal-publishing`, and a description that says what it
does. A `git pull` in this repository can then update the instructions, and
Hermes scans them on load, so a pull cannot smuggle a skill past you.

**A symlink is not a substitute.** Measured: the loader's scan
(`rglob('SKILL.md')`) does not descend into a symlinked directory, so a symlink
from `~/.hermes/skills/portal-publishing` to this checkout silently does not
load. If the agent's session ever starts outside this checkout, copy the skill
instead — and then compare the copies, because a stale instruction is worse than
none:

```bash
cp -r .hermes/skills/portal-publishing ~/.hermes/skills/
sha256sum .hermes/skills/portal-publishing/SKILL.md ~/.hermes/skills/portal-publishing/SKILL.md
```

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
| The skill never loads | `hermes skills list \| grep portal-publishing` | the checkout is not trusted (`hermes skills trust`), or the session's working directory is not this repository |
| It loads in one session and not another | `pwd` | the other session started outside the checkout, so the project root is elsewhere |
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
