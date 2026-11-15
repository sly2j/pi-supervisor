# Supervisor for Pi

Supervisor for Pi is a multi-agent orchestration layer for the pi coding harness, ported from
[claude-supervisor](https://github.com/sly2j/claude-supervisor). Your session becomes a
supervisor that routes each request: it answers simple questions itself, sends small exact
tasks to a fast, cheap agent, and gives larger work to a lead agent that splits it across
parallel workers and has the result reviewed.

It is a pi package that runs through its own launcher, `pi-supervisor`, with its own profile
directory. Plain `pi` is not changed: it keeps its settings, packages and sessions, and does
not load the package. By default the two share one login file
([docs/setup.md](docs/setup.md#logins)).

Status: version 0.x, during the port. The unit and integration suites exist and run without
model calls. The routing test and the end-to-end validation against claude-supervisor have not
run yet, and the interactive setup has not yet been exercised by hand in the pi TUI.

## What it is for

Long-horizon software and research work that spans sessions and benefits from a
research, plan, execute loop and a project memory. For a small one-off task, plain `pi` is
likely more effective.

## Quick start

Requirements: pi 1.5.2 or later, macOS or Linux with a POSIX shell (Windows is not supported),
`git`, and credentials for at least one model provider. The repository is private, so cloning
needs access to `sly2j/pi-supervisor`.

```sh
git clone git@github.com:sly2j/pi-supervisor.git
cd pi-supervisor
./install            # profile in ~/.config/pi-supervisor, launcher in ~/.local/bin
pi-supervisor        # press Enter to run the setup wizard
```

If `~/.local/bin` is not on your `PATH`, `./install` prints the line to add.

On the first start a wizard maps four model tiers to the models you have credentials for.
[docs/setup.md](docs/setup.md) has every step, the install flags, update and uninstall.

| Tier | Agents |
|---|---|
| `top` | `supervisor`, `writer`, `scope-critic` |
| `strong` | `planner`, `researcher`, `critic`, `writer-worker` |
| `standard` | `executor`, `curator`, and the executor, planner and researcher workers |
| `fast` | `fixer`, `git-ops`, `scout` |

A Claude subscription used through pi is billed as extra usage, per token, and not from the
plan's limits; the wizard shows pi's notice when this applies.

## Using it

Ask for what you want; the supervisor picks the path.

| Agent | Handles |
|---|---|
| `supervisor` | Your session: routes requests, briefs agents, reports back |
| `researcher` | Investigation, code tracing, literature |
| `planner` | Decision-and-outline plans, questions first |
| `executor` | Code, tests, config, agent files, git conflicts, Python environments |
| `writer` | Technical and scientific prose, slide content, project docs |
| `critic`, `scope-critic` | Review of a lead's result, for quality and for scope creep |
| `fixer`, `git-ops`, `scout` | Small exact edits, routine git, read-only lookups |
| `curator` | The project memory: "remember ...", "forget ...", close-out |

Commands inside `pi-supervisor`:

| Command | Effect |
|---|---|
| `/supervisor-config` | Run the tier wizard; `status` and `doctor` as arguments show the setup and check it |
| `/supervisor off`, `/supervisor on` | Turn the supervisor off or on for the session |
| `/close-out` | Finish the session's work and say whether a new session is safe |
| `/pick-up` | Resume a plan in a new session |
| `/project-backup` | Zip the project |
| `/meeting-summary <transcript path>` | Write minutes from a transcript |
| `/supervisor-memory <externalize\|link\|status>` | Keep the memory store outside the repo |

Project state lives in `.supervisor/` at the project root: plans, research, and memory entries
for decisions, facts, goals, conventions and lessons. Start a fresh session with `/new` when a
close-out says it is safe, and continue with `/pick-up`.

## Differences from claude-supervisor

The agents, skills and workflow are the same. The differences come from the harness:

- Agents name one of four tiers, not a Claude model; the wizard maps tiers to models of any
  provider pi supports.
- There is no codex-critic script. An optional critic model from another provider replaces it.
- There is no transcript audit tool.
- The session reset is `/new`, not `/clear`.
- The commit trailer is `Co-Authored-By: Supervisor for Pi`.
- pi has no permission prompts, so the git safety rules are instructions, not enforced gates.

## Documentation

- [docs/setup.md](docs/setup.md): install, the wizard, configuration, update, uninstall
- [docs/architecture.md](docs/architecture.md): the extension, dispatch, agents, skills
- [docs/workflow-lifecycle.md](docs/workflow-lifecycle.md): routing, the lead loop, plans, git,
  sessions
- [docs/memory.md](docs/memory.md): the `.supervisor/` store and the `memory` script
- [docs/context-engineering.md](docs/context-engineering.md): the design's reasoning, in brief

## Development

```sh
python3 -m pytest -q    # install script, agent and skill lint, memory script
node --test             # extension logic; Node 22.19 or later, no dependencies to install
```

Repository layout:

```text
install                  installer and uninstaller (POSIX sh)
extensions/supervisor/   the extension: dispatch, tiers, persona, wizard, doctor, commands
agents/                  15 agent definitions
skills/                  16 skills
tests/                   Python and Node test suites
docs/                    documentation
```

## License

Apache-2.0; see [LICENSE](LICENSE).
