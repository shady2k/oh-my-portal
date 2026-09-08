# Agent Instructions

A publishing engine for a personal site, replacing Ghost.
Design: [`docs/design/portal.md`](docs/design/portal.md).

**This repository is public.** Never commit personal data — real names, contact
details, analytics figures, employer or client information, private repository
or host names, infrastructure topology. When in doubt, leave it out and ask.

## The tracker is `br`, not `bd`

Task tracking here is **`br` (beads_rust)**: SQLite plus a git-tracked
`.beads/issues.jsonl`. No Dolt, no daemon, and **no git — `br` never runs it.**

The `beads-superpowers` plugin is kept for its process skills and still says
`bd`. **This file carries the `bd` → `br` mapping and it wins over any skill
that says otherwise** — that is the plugin's own rule about repository
instructions.

**`br robot-docs guide` is the source of truth for how an agent drives `br`, and
`br capabilities --format json` for the contracts.** What follows is that guide
plus what this repository adds; when they disagree, the binary wins and this
section is stale.

### Every session

```bash
export RUST_LOG=error                    # br's dependency logs are noise
br ready --json                          # the ONLY work-discovery entrypoint
br coordination status --json            # is anything already claimed, or stale
br show <id> --json
```

Never hand-roll a status filter (`br list -s open -s rework`) to find work.
`br ready` answers to project policy; a hand-rolled filter does not, and it
silently stops matching the day the policy changes.

### Attribution is not bookkeeping here

Every mutating command carries who did it:

```bash
br update <id> --claim  --actor claude-opus-5 \
  --agent-name claude --model claude-opus-5 --harness claude-code
br close  <id> --reason "..." --actor claude-opus-5 \
  --agent-name claude --model claude-opus-5 --harness claude-code
```

`--actor` sets the assignee on `--claim`, so leaving it off files the agent's
work under the maintainer's name. In a project whose §8 exists to keep agent
work from being passed off as a human's, the tracker is the first place that can
go wrong. The `BR_AGENT_NAME`, `BR_MODEL` and `BR_HARNESS` environment variables
set the same three fields if your shell state survives between commands — in
Claude Code it does not, so pass the flags.

### Writing an issue

```bash
br create "Title" -t task -p 2 --description-file - <<'EOF'
...markdown...
EOF
```

`--description-file` (`-` for stdin) rather than `-d`: multi-paragraph markdown
passed through shell quoting loses newlines and breaks on apostrophes.
The same flag exists on `br update`, which has **no** description-append — read
the current description with `br show --json`, append, write the whole thing
back. Notes and criteria do have appenders: `--append-notes`, `--add-acceptance`.

**Every issue needs a `## Acceptance Criteria` section in its description**, as
a `- [ ]` checklist a stranger could tick without asking anyone. `br lint` is
the gate and must be clean before handoff. Note that `br lint` reads the
markdown heading in the description while `--acceptance-criteria` sets a
separate structured field; a well-formed issue has both.

### Finishing

```bash
br close <id> --reason "..." --actor ... --agent-name ... --model ... --harness ...
br sync --flush-only              # export DB → JSONL before staging .beads/
br lint                           # must be clean
```

`br` never touches git. Staging and committing are yours, and in this repository
they wait for the maintainer to ask (see *Git* below).

**Do not run `br agents --add`.** Its generated block ends with a session
protocol that says to `git commit` and `git push` every session, which is the
opposite of this repository's rule.

Memory left the tracker together with `bd`. Recall is now `deja` over the
session transcripts of every agent on this machine:

```bash
deja "<what you are doing>"       # was: bd memories
```

Unchanged and still forbidden: **TodoWrite, TaskCreate and markdown TODO
lists.** `br` is the tracker for all work, including your own checklists.

## Tooling

| Tool | Purpose | When |
|---|---|---|
| `br` | issue tracker | always |
| `deja` | recall across past agent sessions | before debugging an error or reimplementing anything |
| `repowise` | codebase docs and graph | **once there is code** — the repo is documentation only right now, there is nothing to index |

## Git

Commits and pushes **only when explicitly asked**. At handoff, report changed
files, checks run, issue status and the commands you would run next. Do not
commit or push on your own initiative.

## Non-interactive shell commands

**Always use non-interactive flags** for file operations, or the agent will hang
on a confirmation prompt: `cp`, `mv` and `rm` may be aliased with `-i`.

```bash
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file
rm -rf directory            # NOT: rm -r directory
```

Others that may prompt: `scp` and `ssh` need `-o BatchMode=yes`, `apt-get` needs
`-y`, `brew` needs `HOMEBREW_NO_AUTO_UPDATE=1`.

## Session completion

1. File issues for anything left over
2. Run the checks if code changed
3. Update statuses: `br close <id> --reason "..."`
4. Report and **stop** — git is the maintainer's call
