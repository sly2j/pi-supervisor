# Architecture

## Overview

Supervisor for Pi is one pi package: one extension, 15 agent files and 16 skills. It has no
runtime npm dependencies. The `install` script registers the clone in a separate pi profile and
writes the `pi-supervisor` launcher ([setup.md](setup.md)).

Inside the launcher, your session is the supervisor:

```text
you -> supervisor (main session, top tier)
         |- scout, fixer, git-ops        fast specialists, no review
         |- curator                      memory store
         `- researcher, planner, executor, writer     leads
              |- <lead>-worker           parallel units
              `- critic, scope-critic    review
```

## The extension

`extensions/supervisor/` holds eight modules.

| File | Role |
|---|---|
| `index.ts` | Entry point; registers the `dispatch` tool and wires the other modules |
| `agents.ts` | Parses `agents/*.md` and builds the skill blocks given to a child |
| `tiers.ts` | Loads `pi-supervisor.json` and resolves an agent's tier to a model |
| `dispatch.ts` | Starts child pi processes, collects their results, stops them on abort |
| `persona.ts` | Makes the main session the supervisor; `/supervisor` |
| `setup.ts` | The tier wizard, status and first-start offer; `/supervisor-config` |
| `doctor.ts` | The readiness checks |
| `commands.ts` | `/close-out`, `/pick-up`, `/project-backup`, `/meeting-summary`, `/supervisor-memory` |

### The supervisor persona

In the main session, and only with a valid configuration, the extension:

- selects the `top`-tier model;
- sets the active tools to the `tools` list of `agents/supervisor.md`, which has no `bash`;
- appends the body of `agents/supervisor.md` to pi's system prompt on every turn.

The model, thinking level and tools that were active before are saved in the session, and
`/supervisor off` restores them. The persona and the commands are registered only in the main
session; a dispatched agent gets the `dispatch` tool alone.

### Dispatch

`dispatch` takes `tasks: [{agent, task, model?}]`, 1 to 8 tasks per call, and runs at most 6 at
once. Results come back in input order. A failed task returns an error entry, and the other
tasks still run.

Each task runs as a separate pi process:

```text
pi --mode json -p --session-dir <dir> --model <provider/id> [--thinking <level>]
   --tools <list> --append-system-prompt <agent body> [--append-system-prompt <skill>]...
   "Task: <task>"
```

- The child inherits the working directory and the environment, including
  `PI_CODING_AGENT_DIR`, so it runs in the same profile and loads the same package.
- The child sees only its task text, not the parent's conversation.
- The agent body and each preloaded skill are appended to pi's system prompt in full. pi's own
  prompt, the repository's `AGENTS.md` or `CLAUDE.md`, and the skill catalog stay in place.
- The result is the text of the child's last assistant message, cut at 50 KB.
- Child sessions are stored under `<profile>/pi-supervisor/sessions/<parent session id>/`.
- Aborting the parent, or ending its session, sends `SIGTERM` to every child and `SIGKILL`
  five seconds later.

Nesting is limited to two levels: the main session dispatches a lead, and the lead dispatches
workers and reviewers. The extension passes the depth to each child in `PI_SUPERVISOR_DEPTH`
and refuses a dispatch at depth 2. Workers, reviewers and specialists also have no `dispatch`
in their tool lists. Which agents a lead may call is prompt text, checked by the lint tests.

### Tiers and models

An agent file names a tier, never a model. `pi-supervisor.json` maps the four tiers to
`provider/id` strings ([setup.md](setup.md#configuration-file)). The model for a dispatch is
chosen in this order:

1. for the `critic` agent, the configured critic model, if one is set;
2. the tier given in the task's `model` field (`top`, `strong`, `standard` or `fast`);
3. the tier in the agent's frontmatter.

`model` accepts tier names only; an unknown name is an error. `fixer`, `git-ops` and `scout`
also set `thinking: xhigh`, which is passed to the child as `--thinking xhigh`.

## Agents

The table follows the frontmatter of `agents/*.md`. No agent has `dispatch` except the
supervisor and the four leads. The web tools `web_search` and `fetch_content` come from the
optional `pi-web-access` package.

| Agent | Role | Tier | Tools | Preloaded skills |
|---|---|---|---|---|
| `supervisor` | Your session: routes, briefs, reports | `top` | read, edit, write, grep, find, ls, dispatch, web | - |
| `researcher` | Lead: investigation, code tracing, literature | `strong` | read, bash, edit, write, grep, find, ls, dispatch, web | `lead-loop`, `residue` |
| `planner` | Lead: decision-and-outline plans | `strong` | as `researcher` | `lead-loop`, `plan-writing`, `repo-workflow` |
| `executor` | Lead: code, tests, config, agent files, conflicts | `standard` | as `researcher` | `lead-loop`, `git-safety`, `repo-workflow`, `residue` |
| `writer` | Lead: prose, slide content, project docs | `top` | as `researcher` | `lead-loop`, `project-memory` |
| `researcher-worker` | One bounded question | `standard` | read, bash, write, grep, find, ls, web | `residue` |
| `planner-worker` | One repo question for a plan | `standard` | read, bash, grep, find, ls, web | - |
| `executor-worker` | One unit of change | `standard` | read, bash, edit, write, grep, find, ls, web | `residue` |
| `writer-worker` | Extract one source, or draft prose | `strong` | as `executor-worker` | `project-memory` |
| `critic` | Reviews a result against its contract | `strong` | read, bash, grep, find, ls, web | - |
| `scope-critic` | Rules on the critic's findings, lists bloat | `top` | read, grep, find, ls, web | - |
| `curator` | Curates the memory store | `standard` | read, edit, write, find, ls, grep, bash | `project-memory` |
| `fixer` | Small exact edits, runs a given command | `fast` | read, edit, write, find, ls, grep, bash | `project-memory`, `residue` |
| `git-ops` | Routine git with guardrails | `fast` | bash, read, find, ls, grep | `git-safety`, `repo-workflow` |
| `scout` | Read-only lookups | `fast` | read, bash, grep, find, ls, web | - |

The supervisor changes the tier of a single dispatch in three cases: `strong` for a `writer` on
short, low-stakes prose, `strong` for an `executor` on difficult work, and `top` for a
`planner` on programs and open designs.

## Skills

A skill is a directory under `skills/` with a `SKILL.md`. An agent's preloaded skills are in
its system prompt from the start; any agent can load the others on demand through pi's skill
catalog.

| Skill | Content |
|---|---|
| `lead-loop` | The protocol every lead follows: contract, fan-out, review, decision, report |
| `plan-writing` | The plan format, including work packages |
| `repo-workflow` | Versioning, branches, worktrees, checks and landing |
| `git-safety` | Gates on destructive git commands, secret checks, commit and attribution rules |
| `project-memory` | The `.supervisor/` store: layout, entries, retrieval; holds the `memory` script |
| `residue` | Recording and removing what tests and experiments leave behind |
| `close-out`, `pick-up` | The procedures behind `/close-out` and `/pick-up` |
| `project-backup` | The backup script behind `/project-backup` |
| `agent-authoring` | Conventions for agent and skill files |
| `science-writing-style`, `presentation-style` | Style rules for documents and slides |
| `document-extraction`, `email-extraction`, `meeting-summary` | Extracting facts from a source |
| `python-env` | Creating and repairing Python environments |

## Differences from claude-supervisor

The agents, skills and workflow are ported from claude-supervisor. The harness differs, and so
do these points:

| claude-supervisor | Supervisor for Pi |
|---|---|
| Claude Code's `Agent` tool | The package's own `dispatch` tool, running child pi processes |
| Agents name Claude models | Agents name a tier; the wizard maps tiers to any provider's models |
| Optional codex-critic script as the review backend | No script; an optional critic model from another provider |
| `deploy` installer, `claude-supervisor` launcher | `install` script, `pi-supervisor` launcher |
| Transcript audit tool | None |
| Session reset with `/clear` | `/new` |
| Worktrees in `.claude/worktrees/` | `.pi/worktrees/` |
| `claude-supervisor memory ...` | `/supervisor-memory ...`; handles `.supervisor` only |
| Trailer `Co-Authored-By: Supervisor for Claude` | `Co-Authored-By: Supervisor for Pi` |
| Permission prompts for shell commands | pi has none; the git gates are instructions in `git-safety` |

## What is enforced

The extension enforces the tool list of every agent, the model of every dispatch, the depth
limit, the task and concurrency limits and the result cap. Everything else, such as which lead
calls which agent, the review rounds, the git gates and the commit trailer, is instruction text
in agent and skill files. An agent can deviate from it, and how well a given model family
follows it has not been measured yet.

## Tests

`python3 -m pytest -q` lints the agent and skill files (frontmatter, tiers, tool names,
leftovers from the source pack, length limits) and exercises `install` and the `memory` script
in temporary directories. `node --test` covers the extension modules, partly against pi itself
with a scripted provider that makes no model calls. One live nested run is opt-in
(`PI_SUPERVISOR_LIVE=1`) and costs tokens.
