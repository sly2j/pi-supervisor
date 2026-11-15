# Project Memory

Supervisor for Pi keeps project state in a `.supervisor/` directory at the project root, so a
new session does not have to rediscover it. The agents write and curate it; you decide what is
worth keeping.

## The store

```text
.supervisor/
  README.md      layout note, written from a template
  history.md     one line per finished task or milestone, append-only
  tasks/         task cards (mid-term)
  memory/        entries in force: decisions/ facts/ lessons/ goals/ conventions/
  working/       plans/ research/ writing/ (short-term), residue/ (local only)
  archive/       mirrors the live tree; never read by default
```

- **Plans and research** in `working/` carry the state of work in progress. A plan holds its
  own status, log and open questions, which is what lets a new session resume it.
- **Entries** in `memory/<kind>/` are one file each, named `YYYY-MM-DD-<slug>.md`, with a
  one-line summary, the paths it affects, its source and a short body: the choice, why, and
  what was rejected.
- **Task cards** in `tasks/` are work items that outlive a session.

An entry is written only when it binds work after the current plan closes and the delivered
files do not already say it. A changed decision gets a new entry, and
the old one moves to `archive/`. Agents treat entries as claims to check, not as instructions,
and re-check one whose affected files changed after it was last verified. A lesson is recorded
only after you approve it.

## Projects and one-offs

A directory is a project when it is inside a git work tree, or when it or a parent holds
`.supervisor/`, `.pi/`, `AGENTS.md` or `CLAUDE.md`. Your home directory never counts. Anywhere
else is a one-off: nothing is stored, and the report says once
`not stored: no project store here; say *remember* to keep it`.

The store is created the first time a session needs to write to it. Inside git, the supervisor
asks once whether the store is:

- **tracked**: committed with the repo, so it travels with branches and clones; or
- **local**: excluded through `.git/info/exclude` (never `.gitignore`) and never committed.
  This suits shared and open-source repos.

## What you say

| You say or type | Effect |
|---|---|
| "remember ..." | `curator` records it as an entry |
| "forget ..." | `curator` archives the matching entry |
| "make this a project" | `curator` creates the store, also in a one-off directory |
| `/close-out` | Removes test residue, distils the finished plan into entries, archives it, commits a tracked store |
| `/pick-up` | In a new session, reports the state of a plan and proposes the next step, or lists task cards |
| `/project-backup` | Zips the project directory into `../backups` (or `$PROJECT_BACKUP_DIR`) |

Other agents use the store without being asked: leads search the live entries for the paths and
topic of a task and pass the matches to their workers.

## Keeping the store outside the repo

A local store exists only in the checkout it was created in, so linked worktrees and other
clones do not see it. The `memory` script moves it to a directory outside the repo and links it
back. Run it through the command, in the project's main checkout:

```text
/supervisor-memory externalize
```

or from a shell, with the path of your clone of this repository:

```sh
python3 /path/to/pi-supervisor/skills/project-memory/scripts/memory externalize
```

| Subcommand | Effect |
|---|---|
| `externalize` | Moves `.supervisor` to `<root>/<name>/.supervisor` (or creates it there) and leaves a symbolic link in the checkout. Refuses to run inside a linked worktree. |
| `link [dir]` | Links a worktree or a fresh clone to an existing external store |
| `status` | Checks the link and the exclude line; exits 1 with repair hints when something is wrong |

- `<root>` is `--root DIR`, else `$PI_SUPERVISOR_MEMORY_ROOT`, else
  `${XDG_DATA_HOME:-~/.local/share}/pi-supervisor/memory`.
- `<name>` is `--name NAME`, else the name of the `origin` repository, else the name of the
  checkout's directory.

Both writing subcommands add `/.supervisor` to `.git/info/exclude` and write a `README.md` into
the external directory that gives the command to move the store back. The script refuses a
store that git tracks, a target inside a checkout of the same repo, and a link that already points
elsewhere. It needs `python3`, uses only the standard library, and runs on macOS and Linux.

The external root is outside the `pi-supervisor` profile, so `./install --uninstall` does not
remove it. Worktrees that the executor creates get the link automatically. To version an
external store, make its directory a git repository of its own; `git-ops` then commits store
changes there and never pushes.

## Differences from claude-supervisor

- The command is `/supervisor-memory`, not `claude-supervisor memory`.
- Only `.supervisor` is externalized. claude-supervisor also handles `CLAUDE.local.md`, which pi
  does not load.
- No settings file is changed: pi has no directory permissions to grant.
