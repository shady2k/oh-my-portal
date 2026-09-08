# Project Instructions for AI Agents

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

```bash
br ready                        # what to work on next     (was: bd ready)
br show <id>                    # view an issue
br update <id> --claim          # claim work
br close <id> --reason "..."    # close with evidence a stranger can check
br create "Title" -t task -p 2
br dep add <id> <depends-on>    # add a dependency
deja "<what you are doing>"     # recall past sessions     (was: bd memories)
```

Memory left the tracker together with `bd`. Recall is now `deja` over the
session transcripts of every agent on this machine.

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
