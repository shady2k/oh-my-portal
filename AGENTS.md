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
the gate and must be clean before handoff.

The list lives in two places and they do not update together: `br lint` reads
the markdown heading in the **description**, while `--acceptance-criteria`,
`--add-acceptance` and `--check-acceptance` operate on a separate **structured
field**. A well-formed issue has both, and ticking an item means updating both —
run `--check-acceptance`, then rewrite the description's section from the field
with `--description-file`. Ticking only the field leaves the description saying
the work is undone.

### Finishing

```bash
br close <id> --reason "..." --actor ... --agent-name ... --model ... --harness ...
br sync --flush-only              # export DB → JSONL before staging .beads/
br lint                           # must be clean
```

`br` never touches git. Staging and committing are yours, and in this repository
they wait for the maintainer to ask (see *Git* below).

`br agents --add` has been run: AGENTS.md carries `br`'s own generated block,
between `br-agent-instructions` markers, with a note before it saying which two
parts of it this repository overrides. Never edit inside the markers —
`br agents --update` replaces that region wholesale.

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

### About the generated block below

Everything between the `br-agent-instructions` markers is written by
`br agents --add` and is replaced wholesale by `br agents --update`. Do not edit
inside it; it will not survive. This note sits outside the markers on purpose.

Two things in it do not apply here:

- Its **Session Protocol** ends in `git commit` and `git push` every session.
  This repository does neither without being asked — see *Git* and *Session
  completion* above, which win.
- Its command list omits the attribution flags. Every mutation here carries
  `--actor` and the `--agent-name`/`--model`/`--harness` triple, for the reason
  given under *Attribution is not bookkeeping here*.

It is kept because it is the version `br` itself vouches for, and because
`br agents --check` reports a repository without it as incomplete.

<!-- br-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`/`bd`) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View ready issues (open, unblocked, not deferred)
br ready              # or: bd ready

# List and search
br list --status=open # All open issues
br show <id>          # Full issue details with dependencies
br search "keyword"   # Full-text search

# Create and update
br create --title="..." --description="..." --type=task --priority=2
br update <id> --status=in_progress
br close <id> --reason="Completed"
br close <id1> <id2>  # Close multiple issues at once

# Sync with git
br sync --flush-only  # Export DB to JSONL
br sync --status      # Check sync status
```

### Workflow Pattern

1. **Start**: Run `br ready` to find actionable work
2. **Claim**: Use `br update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `br close <id>`
5. **Sync**: Always run `br sync --flush-only` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `br ready` shows only open, unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers 0-4, not words)
- **Types**: task, bug, feature, epic, chore, docs, question
- **Blocking**: `br dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
br sync --flush-only    # Export beads changes to JSONL
git commit -m "..."     # Commit everything
git push                # Push to remote
```

### Best Practices

- Check `br ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `br create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always sync before ending session

<!-- end-br-agent-instructions -->
