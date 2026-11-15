# Plan: pi-supervisor, a port of claude-supervisor to the pi coding harness

Date: 2026-11-14; annotated 2026-11-15 (dedicated launcher, decided questions, GitHub remote).
Approved by the user 2026-11-15. Parent plan of a program. Pointers are taken against claude-supervisor commit
`6a49e38` (v10.2) and pi `@earendil-works/pi-coding-agent` 1.5.2.

Abbreviations: `CS/` = `/Users/sjoosten/Work/pi-supervisor-work/claude-supervisor/` (read-only);
`PI/` = `/Users/sjoosten/.pi/agent/install/releases/1.5.2/node_modules/@earendil-works/pi-coding-agent/`;
`R` = `.supervisor/working/research/research-pi-supervisor-port.md`. Paths without a prefix are
relative to the project root `/Users/sjoosten/Work/pi-supervisor-work/pi-supervisor/`.

## Goal

Build `pi-supervisor`, a pi package that gives pi the same supervisor setup as claude-supervisor
10.2: 15 agents, routing Modes 1 and 2, the lead loop with critic and scope-critic, the skills,
programs and work packages, the `.supervisor/` store and the report contracts, on four
configurable model tiers. It runs through its own `pi-supervisor` launcher and agent directory,
as claude-supervisor runs through `claude-supervisor`; plain `pi` stays as it was.

Non-goals: changing claude-supervisor; changing plain `pi`, its agent directory
(`~/.pi/agent`) or the user's other pi setups; features the source lacks (background agents, resume,
messaging a running child, a bash approval gate); a port of the transcript audit tool; Windows
support (the source is POSIX-only);
publishing to npm or listing in the pi gallery; a shared external store root between the two
harnesses.

Expected change size: about 8,250 new lines in this project. About 3,500 are adapted copies
(agents 900, skills and references 1,900, `backup.sh` 260, memory script 400); about 4,750 are
new (extension TypeScript 1,800, the `install` script 150, tests 1,800, docs 900, project
files 100).

## Approach

One pi package with one extension, shipped agent and skill files, and zero runtime npm
dependencies. The extension registers a `dispatch` tool that runs each agent as a child `pi`
process (`--mode json -p`), resolving the agent's tier to a `provider/id` from a config file
written by a setup wizard. The same extension, loaded inside a child, reads two environment
variables to learn which agent it is and how deep it runs, and refuses to dispatch at depth 2.
In the main session it appends the supervisor
persona to the system prompt, selects the `top`-tier model and sets the active tools to the
`tools` list of `agents/supervisor.md`, which has no `bash`. Agent and skill text is copied from `CS/pack`
and adapted by a fixed translation table (D12).

Isolation follows the source's launcher (D20): an `install` script in the repo creates a
separate pi agent directory `~/.config/pi-supervisor`, installs the package there only, links
the user's pi logins into it (D21), and writes a `pi-supervisor` launcher that exports
`PI_CODING_AGENT_DIR` and execs `pi`. Every child inherits that directory (D3).

Order: bootstrap, then the nested-dispatch proof (the riskiest mechanism) next to the
independent memory tool, then the bulk port in three parallel packages, then validation and
docs.

Rejected alternatives:
- In-process children through the pi SDK: no crash isolation, and a child's abort or failure
  shares the parent's process.
- pi virtual models (`tier/top`) in place of a config lookup: a child must load the extension
  before it can resolve its own model, and auth errors surface late.
- Replacing the child's system prompt with the agent body: children would lose pi's tool
  guidance, the repository context files and the skill catalog, which the pack relies on
  (`CS/pack/skills/repo-workflow/SKILL.md:9`).
- Prompt templates for the literal slash names: a template cannot dispatch, run a script or
  ask a question; extension commands can.
- A TypeScript rewrite of the memory tool as a pi command: child agents and the user's shell
  could not run it; a script can be run by all three.
- A global install with the persona on by default: it takes over every pi session on the
  machine (the user rejected it, 2026-11-15).
- A `--supervisor` flag or `/supervisor on` in plain pi: the package would still load into
  every session and child of the user's default setup.

## Decisions

User decisions 1-8 in the brief are binding and are restated under `## Scope Notes`.

- D1 Package form. `package.json` with `pi: {extensions: ["./extensions/supervisor/index.ts"],
  skills: ["./skills"]}`, keyword `pi-package`, host libraries as `peerDependencies: "*"`, no
  `dependencies`. Reason: a local-path install does not run `npm install` (`PI/docs/packages.md`),
  so zero dependencies keeps every install source working. Frontmatter is parsed with pi's
  exported `parseFrontmatter` (`PI/examples/extensions/subagent/agents.ts:7`).
- D2 Dispatch runs child processes, following `PI/examples/extensions/subagent/index.ts`
  (argument assembly 389-396, binary lookup 292-308, JSONL parsing 445-478, abort 487-495).
  One tool, `dispatch`, takes `tasks: [{agent, task, model?}]` (1 to 8 entries, at most 6
  running at once). Reason: lead-loop fans out up to 6 units in one message, and whether pi
  runs several tool calls of one message concurrently is unverified; an array makes parallel
  dispatch certain.
- D3 A child is `pi --mode json -p --session-dir <dir> --model <provider/id> [--thinking <l>]
  (--tools <list> | --exclude-tools <list>) --append-system-prompt <agent body file>
  [--append-system-prompt <skill file>]... "Task: <task>"`. The child inherits the parent's cwd and environment,
  including `PI_CODING_AGENT_DIR`, so every child and grandchild runs in the parent's profile.
- D4 Topology, as far as the source's harness enforces it: leaves cannot spawn and depth is
  capped. The parent sets `PI_SUPERVISOR_AGENT=<name>` and `PI_SUPERVISOR_DEPTH=<n>` on the
  child; `dispatch` refuses at depth 2, and every leaf agent lacks the tool (`excludeTools`, or
  absent from its `tools` allowlist). Which agent a lead may call stays prompt text, checked
  by lint as in the source (`CS/tests/test_pack_lint.py:138-179`). Reason: every child runs
  in the profile that loads the extension (D3), and the research flags unlimited recursion as a
  risk (`R`, Q3).
- D5 Preloaded skills are injected in full: each skill named in an agent's `skills:` is
  appended in the block format pi itself uses for `/skill:name` (`<skill name location>`,
  "References are relative to <dir>", body). Reason: brief default; pi only lists skills.
- D6 Tier names, highest to lowest: `top`, `strong`, `standard`, `fast` (user decision; they
  replace the source's Anthropic model names one for one through the D12 row). The
  agent tier table, the override rules and the 28 routing cases carry over with the names
  mapped. The wizard and the doctor show each with its role. None of the four is a pi thinking
  level (`off` to `max`) or part of the `provider/id[:thinking]` syntax, but `--model` also
  fuzzy-matches IDs and `fast` is a substring of catalog IDs (`glm-5p3-fast`), so a tier name
  never reaches `--model`. Alternative if the user prefers no overlap: `quick`, which matches no
  catalog ID or name and no thinking level.
- D7 Config lives at `<agent dir>/pi-supervisor.json`: `tiers` (four `provider/id[:thinking]`
  strings), `critic` (`null` or a `provider/id[:thinking]`), `version`. It can be written by
  hand. `dispatch` accepts only tier names in `model`; which overrides are allowed stays prompt
  text, as in the source (`CS/pack/skills/agent-authoring/SKILL.md:24-29`).
- D8 Effort: agent frontmatter `thinking: xhigh` on fixer, git-ops and scout becomes
  `--thinking xhigh`; other agents pass no flag unless the tier string carries a suffix.
- D9 Critic model. When `critic` is set it replaces the critic's model on every critic
  dispatch, including the `top` override. Reason: the codex backend it replaces also took every
  round (`CS/pack/skills/lead-loop/SKILL.md:57-63`). The probe step and the codex-critic script
  are dropped; `scope-critic` is unaffected.
- D10 Persona. It is on by default wherever the package loads, which with the documented
  install is only the `pi-supervisor` profile (D20). With a valid config, `session_start` selects the `top`-tier model with
  `pi.setModel` and sets the active tools to the `tools` list of `agents/supervisor.md` with `setActiveTools`, which drops `bash`, and `before_agent_start` appends
  `agents/supervisor.md` by returning `{systemPrompt}` (the typed result), not by mutating `appendSystemPrompt`.
  `/supervisor off|on` toggles all three for the session, restoring the saved model and tools.
  Without a config the persona stays off and a status line names `/supervisor-config`.
- D11 Commands, all literal: `/supervisor-config` (wizard; subcommands `status` and `doctor`),
  `/supervisor`, `/close-out`, `/pick-up`, `/project-backup`,
  `/meeting-summary`, `/supervisor-memory`. `/close-out` and `/pick-up` send the skill block plus
  arguments as a user message. `/project-backup` runs `backup.sh` with `pi.exec` and shows the
  output. `/meeting-summary` runs the skill in one `writer-worker` child, which replaces
  `context: fork`. The `supervisor-config` skill becomes the command only, so 16 skills ship.
- D12 Translation table for agent and skill text (P3 and P4 apply it; nothing else changes):

  | Source | Port |
  |---|---|
  | `Agent(subagent_type: "x", ...)`, "Agent tool" | `dispatch(tasks: [{agent: "x", ...}])`, "`dispatch` tool" |
  | `model:` (tier), `effort:` | `tier:`, `thinking:` |
  | `fable`, `opus`, `sonnet`, `haiku`, in any case and position (frontmatter, `model: x` overrides, `Planning tier: x`, prose such as "quick tier (Haiku)", "Fable-tier", trigger words) | `top`, `strong`, `standard`, `fast` (D6) |
  | `tools:` / `disallowedTools:` | `tools:` / `excludeTools:` with pi names |
  | Read, Edit, Write, Bash, Grep | `read`, `edit`, `write`, `bash`, `grep` |
  | Glob | `find`, `ls` |
  | `Agent` in a deny list | `dispatch` in `excludeTools` |
  | NotebookEdit | dropped |
  | WebSearch, WebFetch | `web_search`, `fetch_content` |
  | AskUserQuestion | a plain-text question (agents); `ctx.ui` (commands) |
  | `${CLAUDE_SKILL_DIR}/x` | `x`, relative to the skill directory |
  | `$ARGUMENTS` | "the arguments after the skill block" |
  | `CLAUDE.md` | "`AGENTS.md` or `CLAUDE.md`"; new lines go to the one that exists, else `AGENTS.md` |
  | `CLAUDE.local.md` | removed (D14) |
  | `.claude/worktrees/` | `.pi/worktrees/` |
  | `user-invocable`, `context`, `argument-hint` | removed (pi ignores unknown keys; D11 covers fork) |
  | `claude-supervisor memory ...` | `/supervisor-memory ...` and the script path |
  | codex-critic, `<config>`, probe | removed (D9) |
  | "harness attribution reminders" | removed (pi injects none) |
  | "Supervisor for Claude", `Co-Authored-By: Supervisor for Claude` | "Supervisor for Pi", `Co-Authored-By: Supervisor for Pi` (D22) |
  | `claude-supervisor` (launcher), `~/.config/claude-supervisor` | `pi-supervisor`, `~/.config/pi-supervisor` (D20) |

- D13 Web access: `pi-web-access` (`npm:pi-web-access`), tools `web_search` and
  `fetch_content`. Reason: it registers named tools that `--tools` can select, works without a
  key (Exa MCP, DuckDuckGo) and with an OpenAI key, has no headless browser, and was released
  2026-11-05. The `brave-search` skill needs a Brave key with a credit card, a manual
  `npm install`, and `bash` in every child. `pi-web-search` has no general fetch.
  It is installed into the `pi-supervisor` profile only: the wizard's `pi install` runs inside
  the launcher, so it inherits `PI_CODING_AGENT_DIR` and lands in `<profile>/npm` and the
  profile's `settings.json` (`PI/dist/core/package-manager.js:1890`).
  Its default `toolActivation: "auto"` may hide the tools in a child; P1 tests this and picks
  the fix (set `"eager"` in `<agent dir>/web-search.json`, or allow `web_enable`).
- D14 Memory tool. `skills/project-memory/scripts/memory` is the stdlib Python from
  `CS/deploy:2140-2433` with the settings grant removed, handling `.supervisor` only. Root:
  `$PI_SUPERVISOR_MEMORY_ROOT`, else `$XDG_DATA_HOME/pi-supervisor/memory/<project>`.
  `CLAUDE.local.md` is not handled: pi does not load it (`R`, Q2), so there is nothing to link.
- D15 Child sessions are kept under `<agent dir>/pi-supervisor/sessions/<parent session id>/`
  instead of `--no-session`. Reason: the end-to-end checks in P6 read them as evidence of which
  children ran, and this directory stays out of the user's `/resume` list.
- D16 Tests: `python3 -m pytest -q` for the pack lint and the memory script (direct ports of
  the source tests), and `node --test` for extension logic (Node 22.19 or later
  strips types; no dev dependencies). Extension logic that needs testing lives in modules with
  type-only host imports; `loadAgents` takes the frontmatter parser as an argument, so tests
  pass a small stand-in and `index.ts` passes pi's.
- D17 Token-free integration tests run pi under a temporary `PI_CODING_AGENT_DIR` whose
  settings load this package and a scripted provider. P1 tries pi-ai's `fauxProvider`
  (`PI/../pi-ai/dist/providers/faux.d.ts`) through an extension first, and falls back to a
  local OpenAI-compatible stub server declared in `models.json`.
- D18 Project setup. P0 runs `git init -b main` in the project directory and makes the first
  commit, including `.supervisor/`. Remote: D25. The root `CLAUDE.md` holds the
  conventions (pi reads it too). Versioning is the `package.json` `version` field: `0.x` during
  the port, `1.0.0` at parity sign-off; no `VERSION` file. License: Apache-2.0, as the source.
- D19 Accepted differences: commit attribution is skill text only (`git-safety`); no bash
  approval gate (brief default); a project-local install (`pi install -l`) works only once the
  project is trusted in the pi-supervisor profile (`defaultProjectTrust`), and is otherwise
  unsupported; observed in P1; the documented install is the launcher (D20).
- D20 Launcher and profile, mirroring `CS/deploy:115-170,272-292`. A POSIX `sh` script
  `install` at the repo root, run from a clone:
  - `./install [--prefix DIR] [--profile DIR] [--separate-login]`: creates the profile
    (default `~/.config/pi-supervisor`, mode 0700), applies D21, runs
    `PI_CODING_AGENT_DIR=<profile> pi install <clone path>` (local path, loads in place), and
    writes `<prefix>/bin/pi-supervisor` (default prefix `~/.local`). Re-running it is the
    update step and is idempotent.
  - The launcher carries the marker `# managed by pi-supervisor`, exports
    `PI_CODING_AGENT_DIR=<profile>` and runs `exec pi "$@"`, so every pi subcommand works
    inside the profile (`pi-supervisor list`, `pi-supervisor update --extensions`).
  - It refuses a profile equal to `~/.pi/agent` or to an active `PI_CODING_AGENT_DIR`, and
    refuses to overwrite a launcher path without the marker.
  - It never edits shell rc files: when `<prefix>/bin` is not on `PATH` it prints the
    `export PATH=...` line to add, as the source does (`CS/deploy:1377-1379`).
  - `./install --uninstall [--prefix DIR] [--profile DIR] [--yes]`: after the user types `pi-supervisor` (skipped with
    `--yes`), it deletes the launcher only if it carries the marker, then the profile. The
    auth link is unlinked, never followed. The memory store (D14) and plain pi are left alone.
  - Feasible on pi 1.5.2: the variable relocates `settings.json`, `auth.json`, `models.json`,
    `npm/` and `sessions/` (`PI/dist/config.js:509-555`); there is no `--agent-dir` flag.
  - Opt-in direct install: `pi install <clone path>` into any pi agent directory also works and
    turns the persona on there. Documented as possible but not recommended, with no extra code
    or tests, as the source's `--global` (README "not recommended").
  - Updates: setup step 9; `pi-supervisor update --extensions` updates the web package.
- D21 Credentials. `auth.json` lives in the agent directory, so a new profile sees no logins.
  Options:
  - Link (chosen, default): `<profile>/auth.json` is a symlink to
    `${PI_CODING_AGENT_DIR:-~/.pi/agent}/auth.json` as resolved at install, created as `{}` at
    0600 if missing. Existing logins (now `openai-codex` OAuth) work at once. Refresh is safe
    because pi writes `auth.json` in place through the link and locks the resolved file, so both
    profiles share one lock (`PI/dist/core/auth-storage.js:50,68-72,92`). Security: no second copy of any secret;
    but a `/login` or `/logout` inside the launcher changes plain pi's logins too, and the docs
    say so.
  - Copy at setup: rejected. Two copies of a rotating OAuth refresh token diverge, and the first
    refresh in one profile can invalidate the other's login; it also duplicates secrets.
  - Log in again inside the launcher: kept as `--separate-login` (an empty profile `auth.json`,
    then `/login` inside `pi-supervisor`, as the source's "log in once"). Full isolation for
    one extra login.
  - Environment keys reach both profiles regardless. `models.json` and `settings.json` are not
    linked or seeded, so the user's other packages and custom providers stay out of the profile.
- D22 Product name "Supervisor for Pi"; commit trailer `Co-Authored-By: Supervisor for Pi`
  (user, 2026-11-15). `git-safety` and the root `CLAUDE.md` name it.
- D23 Live runs prefer the subscription login. The user's OpenAI login is stored under provider
  `openai-codex` (OAuth). The `openai` provider also accepts a ChatGPT login
  (`PI/../pi-ai/dist/providers/openai.js:12-19`), but none is stored, so `openai/<id>` uses
  `OPENAI_API_KEY`. The P1 slice 1c config
  maps the tiers to `openai-codex/<id>` models (from `pi-supervisor --list-models codex`,
  cheapest first) and checks in the session's model registry that `openai-codex` models
  have credentials first; if not, it falls back to `openai/<id>` and logs the route with
  its `auth check` `authType`. Each child result's model id shows the route.
- D24 Routing-test pass bar: sign-off at 24 of 28 or better; the target is 28 of 28. Every
  failing case is listed in `docs/parity.md` with a prompt-tuning follow-up (user, 2026-11-15).
- D25 Remote. P0 creates the private GitHub repository `sly2j/pi-supervisor`
  (`gh repo create sly2j/pi-supervisor --private`), adds it as `origin`, and pushes `main`,
  the default branch, after the first commit. Each later package pushes `main` to `origin`
  after its squash commit lands. `.supervisor/` holds no keys, only home-directory paths.
  `.gitignore` lists `auth.json`, `.env*` and `.pi/`, and the P0 check `no_secrets` gates every
  push (user, 2026-11-15).

### Parity map (every row of the `R` mapping table)

| Source capability | Disposition | Package |
|---|---|---|
| Supervisor as main thread | adapted: D10, only in the launcher's profile (D20) | P2 |
| Supervisor tool deny | adapted: D10; NotebookEdit dropped | P2 |
| `Agent` dispatch | adapted: D2, D3 | P1 |
| 15 agent definitions | adapted: D12 | P3 |
| Child context (repo instructions, skill catalog) | carried: append, not replace (D3) | P1 |
| Per-agent tier | adapted: D6, D7 | P1 |
| Per-dispatch model override | carried: `model` in `tasks[]` | P1 |
| `effort: xhigh` | adapted: D8 | P1 |
| Per-agent tool lists | carried: `--tools`, `--exclude-tools` | P1 |
| Tool names | adapted: D12 | P3, P4 |
| WebSearch, WebFetch | adapted: D13 | P1 (test), P2 (install) |
| 17 skills | carried, 16 as skills and one as a command (D11) | P4, P2 |
| Skill preloading | adapted: D5 | P1 |
| `user-invocable`, `context: fork`, `argument-hint` | dropped; fork adapted in D11 | P4, P2 |
| `${CLAUDE_SKILL_DIR}`, `$ARGUMENTS` | adapted: D12 | P4 |
| Slash skills | carried with literal names: D11 | P2 |
| AskUserQuestion | adapted: `ctx.ui` in commands | P2 |
| Subagents cannot ask the user | carried (children have no UI) | P1 |
| Lead loop | carried; concurrency 6 (D2) | P1, P4 |
| Nesting depth 2 | adapted: D4 | P1 |
| Dispatch allowlist per lead | carried: prompt text, lint-checked (D4) | P3 |
| Report contract | carried: final assistant text, capped at 50 KB | P1 |
| `.supervisor/` store | carried unchanged | P4 |
| External store link | adapted: D14; root stays outside the profile, as in the source | P5 |
| Executor worktrees | adapted: `.pi/worktrees/` | P4 |
| Commit attribution | adapted: trailer named by D22; enforcement is skill text only (D19) | P4 |
| `permissions.allow` | dropped: pi has no prompts | - |
| `permissions.additionalDirectories` | dropped: not applicable | - |
| codex-critic backend | dropped (user decision 5); replaced by D9 | P2 |
| Four tiers and `--fable-is-opus` | adapted: D6, D7, wizard | P2 |
| Provider profiles | carried by pi providers and `models.json` | P7 (docs) |
| Installer `deploy`, launcher and separate profile | adapted: `install` script, `pi-supervisor` launcher, own `PI_CODING_AGENT_DIR` (D20, D21); manifest, reconcile and registry dropped (resources load in place) | P0, P7 (docs) |
| `--global` install into the default profile | adapted: opt-in `pi install <clone>`, not recommended (D20) | P7 (docs) |
| `doctor` | adapted: `/supervisor-config doctor` | P2 |
| Lint tests | adapted | P3, P4, P6 |
| Live routing test | adapted | P6 |
| Transcript audit | dropped: developer tool tied to Claude Code transcripts; P6 records it | P6 |
| Background agents | not required | - |

Risks named in `R`: prompt and model portability is measured by the routing test and the
end-to-end run (P6); project trust is covered by D19.

## Outline

```
package.json  CLAUDE.md  LICENSE  README.md  .gitignore
install       POSIX sh: install, update (re-run), --uninstall; writes the launcher (D20, D21)
extensions/supervisor/
  index.ts      entry: reads env, wires the modules below
  agents.ts     loadAgents(dir, parse): AgentDef[]; loadSkillBlock(dir, name): string
  tiers.ts      loadConfig(agentDir): Config | null; resolveModel(agent, override?, config)
  dispatch.ts   buildChildArgs(...): string[]; runChild(...): Promise<ChildResult>; the tool
  persona.ts    before_agent_start and session_start handlers; /supervisor
  setup.ts      wizard, proposeTiers(models): TierMap; /supervisor-config
  doctor.ts     runChecks(): Check[]
  commands.ts   /close-out /pick-up /project-backup /meeting-summary /supervisor-memory
agents/<15 names>.md
skills/<16 names>/SKILL.md  (+ references/, templates/, scripts/ as in CS/pack/skills)
tests/  test_install.py  test_agents_lint.py  test_skills_lint.py  test_pack_cross.py
        test_memory.py  test_live_routing.py  node/*.test.ts  fixtures/
docs/  setup.md  architecture.md  memory.md  workflow-lifecycle.md  context-engineering.md
       parity.md
```

Data shapes:

```ts
type Tier = "top" | "strong" | "standard" | "fast";
type AgentDef = { name: string; description: string; tier: Tier; thinking?: string;
  tools?: string[]; excludeTools?: string[]; skills: string[]; body: string };
type Config = { version: 1; tiers: Record<Tier, string>; critic: string | null };
type ChildResult = { agent: string; model: string; exitCode: number; text: string;
  truncated: boolean; usage: { input: number; output: number; cost: number }; error?: string };
```

Invariants and gotchas:
- `resolveModel`: critic and `config.critic` set gives `config.critic`; else a valid `model`
  override gives that tier; else the agent's tier. An unknown tier name is an error returned to
  the caller, never a fallback.
- `dispatch` returns one result block per task in input order; a failed child (non-zero exit,
  no auth, unknown agent, or a final assistant message whose `stopReason` is an error with exit
  code 0) is an error entry that carries the error message or stderr tail, and the other tasks
  still run.
- Final text is the last assistant message's text from `message_end` events
  (`PI/docs/json.md`); split stdout on LF only.
- The parent's abort signal and its own exit send SIGTERM, then SIGKILL after 5 s, to every
  child; a lead child does the same for its children.
- `index.ts` in a child (`PI_SUPERVISOR_AGENT` set) never applies the persona, never shows UI,
  and registers no commands.
- The extension finds its package root with `dirname(fileURLToPath(import.meta.url))`
  (`PI/examples/extensions/dynamic-resources/index.ts:5`).
- `proposeTiers` ranks the models of one provider by output price and spreads them over the
  tiers, highest first; with fewer than four models, neighbouring tiers share one. It prefers
  the provider of the session's current model.
- Config writes follow `PI/examples/extensions/preset.ts:71` (own file under `getAgentDir()`).
  The web package is installed with `pi.exec("pi", ["install", "npm:pi-web-access"])`, never by
  writing `settings.json`; `pi.exec` inherits the session's environment, so the install lands
  in the current profile only (D13).
- `install` tests run with a temporary `HOME`, prefix and fake default agent directory holding
  a fake `auth.json`; nothing under the real `~/.pi` or `~/.config` is touched (`residue`).
- Agent frontmatter keys: `name`, `description`, `tier`, `thinking`, `tools`, `excludeTools`,
  `skills`.
- Lint ports keep the source constants (`CS/tests/test_pack_lint.py:18-38`): tier set
  (names per D6), word caps, 100-character lines, 300-line skills. Dropped tests: opencode
  leftovers, harness attribution reminders, executable codex script.
- `docs/architecture.md` keeps the agent inventory in step with the frontmatter, as in the
  source.

Setup experience (documented in `docs/setup.md`; steps 0-1 implemented in P0, 2-8 in P2):
0. `git clone git@github.com:sly2j/pi-supervisor.git` (private: the user's GitHub access is
   needed), then `cd pi-supervisor && ./install`. It prints the profile, whether the logins
   were linked, and the PATH line if `~/.local/bin` is missing from `PATH`.
1. Run `pi-supervisor`. Plain `pi` is unchanged.
2. With no config and a UI, the extension offers the wizard at once; otherwise it
   shows the status line.
3. The wizard lists the models that have credentials. With none, it names `/login` inside
   `pi-supervisor` and the provider key variables, and stops.
4. It proposes the four-tier mapping; the user accepts it or changes any tier from a list.
5. With two or more providers available, it asks whether the critic should use a model from
   another provider (default no).
6. If `web_search` is missing, it asks to install `pi-web-access` and runs the install.
7. It writes the config, runs the doctor checks (pi version,
   tier readiness from the session's model registry, not `pi auth check`; web tools present; `python3`, `git`, `zip`), then reloads with `ctx.reload()`, which is terminal for the handler.
8. The next request is routed by the supervisor; the first dispatch works.
9. Update: `git pull` in the clone, `./install`, restart. Uninstall: `./install --uninstall`;
   plain pi, its logins and the memory store stay.

## Slices

Each slice is one package from `## Work Packages`; packages with a `plan` stage get their own
slices in a child plan. Test cases and the checkpoint below are the package's acceptance.

1. P0 Bootstrap: a committed, pushed empty package behind its own launcher.
   - Units: project files; `install` with `tests/test_install.py`.
   - Tests (`tests/test_install.py`, temporary `HOME`, prefix and fake default agent dir):
     - `package_loads: ./install, then pi-supervisor list -> exit 0 and pi-supervisor listed`
     - `launcher_runs: pi-supervisor --version -> exit 0 and pi's version`
     - `auth_linked: ./install -> <profile>/auth.json is a symlink to the fake default file`
     - `auth_link_write_through: pi's AuthStorage (PI/dist/core/auth-storage.js) under the
       profile stores a fake key -> the default file holds it, <profile>/auth.json is a symlink`
     - `separate_login: ./install --separate-login -> <profile>/auth.json is a regular {} file`
     - `refuses_default_dir: --profile <fake default dir> -> non-zero, nothing written`
     - `refuses_foreign_launcher: unmarked file at the launcher path -> non-zero, file unchanged`
     - `default_dir_untouched: checksum of the fake default dir before install and after
       uninstall -> equal`
     - `uninstall: ./install --uninstall --yes -> launcher and profile gone, auth target intact`
     - `reinstall_idempotent: ./install twice -> one package entry, exit 0`
     - `path_hint: prefix bin not on PATH -> prints the export line, no rc file written`
     - `no_secrets: tracked files -> no auth.json, no credential-shaped values (a key prefix
       followed by 20 or more key characters, private-key block headers)`
   - Remote (D25): after the first commit and a passing `no_secrets`, create the private repo
     `sly2j/pi-supervisor`, add it as `origin`, push `main`.
   - Checkpoint: `git log --oneline | wc -l` prints 1, `python3 -m pytest -q tests/test_install.py`
     passes, and `git ls-remote origin main` prints the local `HEAD`.
2. P1 Nested dispatch proof: supervisor to lead to worker and critic, on stub agents.
   - Slice 1a, one configured, restricted child, end to end. Units: `agents.ts` and
     `tiers.ts`; `dispatch.ts` and `index.ts`; fixtures (each with tests).
     - `load_agent: fixture with tier, excludeTools, skills -> AgentDef fields`
     - `load_agent_bad_tier: tier "gpt" -> error naming the file`
     - `resolve_default: executor, no override -> tiers.standard`
     - `resolve_override: planner, model "top" -> tiers.top`
     - `resolve_unknown: model "gpt-6" -> error`
     - `resolve_critic: critic, config.critic set, model "top" -> config.critic`
     - `config_missing: no file -> dispatch returns an error naming /supervisor-config`
     - `args_allowlist: fixer-like agent -> --tools read,edit,write,find,ls,grep,bash`
     - `args_denylist: worker-like agent -> --exclude-tools edit,dispatch`
     - `args_skills: agent with two skills -> three --append-system-prompt files, skill
       blocks in pi's format`
     - `args_thinking: thinking xhigh -> --thinking xhigh`
     - `child_text: scripted provider says "done" -> result text "done", exitCode 0`
     - `child_no_auth: tier maps to a provider without credentials -> error entry with
       stderr tail`
     - `child_provider_error: scripted provider returns an error, exit 0 -> error entry`
     - `child_sees_prompt: scripted provider echoes its system prompt -> contains the agent
       body, the skill body, and the repo context file`
     - Checkpoint: `node --test` passes.
   - Slice 1b, nesting and guards. Units: `dispatch.ts`, `index.ts` (+ tests).
     - `nested: main -> stub lead -> stub worker and stub critic in one call -> lead result
       quotes both child texts`
     - `leaf_has_no_dispatch: stub worker's tool list -> no dispatch`
     - `depth_cap: PI_SUPERVISOR_DEPTH=2 -> dispatch refuses`
     - `parallel: 6 tasks with a 1 s scripted delay -> wall time under 3 s`
     - `abort: abort the main call -> no child or grandchild pid alive after 6 s`
     - `sessions: after nested -> lead and worker JSONL files under the D15 directory`
     - `child_profile: main under a temporary profile, nested -> lead, worker and critic each
       report the same getAgentDir() (a fixture extension writes it to a file), and no file
       appears under the fake default agent dir`
     - Checkpoint: `node --test` passes.
   - Checklist of findings that bind later packages, recorded in the plan `## Log` during 1a
     and 1b: the scripted provider mechanism (D17); whether `before_agent_start` fires in
     print mode; whether a child loads a profile-installed package and a project-local one (D19);
     `pi-web-access` tool visibility in a child and the chosen fix (D13); that unknown skill
     frontmatter keys load without a warning.
   - Slice 1c, one live nested run on the cheapest available models, inside the launcher's
     profile (approved by the user 2026-11-15; route per D23): `live_nested: stub lead, real
     models -> worker and critic texts returned, per-child model ids match the config and name
     openai-codex unless the fallback ran`. Checkpoint: the run's result block and the route
     used are pasted into the plan `## Log`.
3. P5 Memory tool. Units: `skills/project-memory/scripts/memory`, `tests/test_memory.py`.
   - Tests: the cases of `CS/tests/test_deploy_memory.py`, minus `CLAUDE.local.md` and the
     settings grant: `externalize_moves_and_links`, `externalize_refuses_tracked`,
     `externalize_refuses_both_copies`, `link_in_worktree`, `status_ok`,
     `status_broken_link -> exit 1 with a repair hint`, `exclude_lines_written`.
   - Checkpoint: `python3 -m pytest -q tests/test_memory.py`.
4. P2 Setup, persona and commands (child plan).
   - Tests the child plan must include: `propose_four: 5 priced models of one provider ->
     4 distinct tiers by price`; `propose_two: 2 models -> tiers share`; `no_models -> wizard
     stops with the login hint`; `web_install_profile_only: wizard install step under a
     temporary profile -> package listed in the profile's settings.json; fake default dir
     unchanged`; `persona_on: config present, session started on another model ->
     system prompt contains the supervisor body, model is tiers.top, active tools lack
     bash`; `persona_off: /supervisor off -> model and tools
     restored`; `persona_absent_in_child`; `no_config -> persona off, status line`;
     `doctor_tier_not_ready ->
     failing check names the tier`; `close_out_command -> user message holds the skill block
     and the arguments`; `project_backup_command -> runs backup.sh, shows its output`.
   - Checkpoint: `node --test`; a manual wizard run in the TUI, steps 1-8 above.
5. P3 Agents port. Units: one per agent file group (leads, workers, reviewers, Mode 2 and
   curator, supervisor), plus `tests/test_agents_lint.py`.
   - Tests: the agent tests of `CS/tests/test_pack_lint.py` re-targeted to D12 keys:
     `frontmatter_valid`, `matches_tier_table`, `tier_tools`, `body_word_cap`,
     `leaves_exclude_dispatch`, `leads_dispatch_only_own_workers`, `routing_scope`,
     `supervisor_names_routed_agents`, `memory_agents_never_commit`, `line_length`; plus
     `no_source_leftovers: grep for subagent_type, disallowedTools, CLAUDE_SKILL_DIR,
     codex, and the four source tier names of the D12 row (whole words, any case) -> none`.
   - Checkpoint: `python3 -m pytest -q tests/test_agents_lint.py`.
6. P4 Skills port. Units: one per skill directory (disjoint), plus
   `tests/test_skills_lint.py`.
   - Tests: the skill tests of `CS/tests/test_pack_lint.py`: `skill_frontmatter_and_caps`,
     `scripts_executable`, `memory_templates`, `curator_procedures_have_no_git_commit`,
     `default_branch_syncs_with_origin`, `residue_caps`, `teardown_wired`, `pickup_claims`;
     plus `no_source_leftovers` as in P3 and `relative_refs_exist: every relative path a
     skill names -> file exists`.
   - Checkpoint: `python3 -m pytest -q tests/test_skills_lint.py`; the P1 scripted-provider
     run prints no skill warning on stderr.
7. P6 Validation (child plan).
   - Tests the child plan must include: `agent_skill_refs_exist`; `preloads_match_source:
     each agent's skills list equals the source's`; the 28 routing cases of
     `CS/tests/test_live_routing.py` as `(request) -> (mode, agent, model)`, opt-in, run
     through the launcher, with tier names in requests and expected models mapped by D6;
     pass bar per D24;
     `e2e_mode1: a small research request in a scratch repo -> a research file exists and the
     session directory shows researcher, researcher-worker and critic children`;
     `e2e_mode2: a typo fix -> fixer child only`.
   - Checkpoint: both test commands pass; `docs/parity.md` has a result for every parity-map
     row.
8. P7 Docs. Units: one per doc file. `docs/setup.md` covers setup steps 0-9, D21's
   trade-off and `--separate-login`, custom providers in the profile, the opt-in direct install
   (D20), and that `pi update` updates the pi binary shared with plain pi. Checkpoint: every
   command and path in the docs exists (`tests/test_pack_cross.py::docs_paths_exist`).

## Verification

After P6 and P7, with a temporary profile and prefix: `./install --profile <tmp> --prefix <tmp>`,
run the wizard through that launcher, then run `python3 -m pytest -q`, `node --test`, the
opt-in routing test and the two end-to-end runs. Parity holds when every row of
`docs/parity.md` is marked carried, adapted or dropped with a passing check or a stated reason,
and the routing test passes at least 24 of 28 cases, with every failure listed (D24). Then
`./install --uninstall --profile <tmp> --prefix <tmp> --yes` leaves `~/.pi/agent` unchanged; set
`package.json` to `1.0.0` and push.

Model usage: P1 slice 1c is approved and runs on the `openai-codex` subscription (D23; under
1 USD on the API-key fallback). Each P6 run still needs the user's go-ahead; its spend estimates and stop
thresholds are P6-D9's table in `.supervisor/working/plans/plan-pi-supervisor-port-P6.md`.

## Risks

- Prompts tuned for Claude models may route or review worse on other families. The routing
  test and the end-to-end runs measure it; fixing prompt quality per model family is follow-up
  work, not part of this plan.
- pi may run a child's extension load differently from what the docs imply (P1 checklist). If
  children do not load the profile's packages, D3 adds `-e <package entry>` to the child arguments.
- `pi-web-access` is a third-party 0.x package; its tool names or activation default may
  change. The doctor check names the missing tools.
- A lead killed by SIGKILL cannot clean up its children; the abort test covers SIGTERM only.
- Kept child sessions (D15) grow without bound; `docs/setup.md` names the directory to prune.
- Anthropic subscription logins bill per token in pi (`R`, Q4); the wizard shows pi's notice.
- Tiers can collapse to fewer than four distinct models on a small credential set; the wizard
  says so, and routing still works.
- The shared `auth.json` link (D21) means a `/logout` in either profile logs both out; OAuth
  refresh write-back through the link is inferred: P0's `auth_link_write_through` exercises
  pi's writer, not a live OAuth refresh.
- `openai-codex` catalog entries carry prices (P1), so `proposeTiers`'s price ranking needs
  no fallback: the `openai` price fallback is not built.

## Scope Notes

- In scope: package layout, dispatch, tier config and setup, persona activation, the agent and
  skill port, the memory tool, tests and lint, docs.
- Out of scope: see Non-goals. Outward-facing steps that need the user's separate
  confirmation: `npm publish`, listing in the pi gallery. Creating the private repo
  `sly2j/pi-supervisor`, adding it as `origin` and pushing `main` are authorized (D25).
- User decisions `executor` must not reopen: a pi package run through its own `pi-supervisor`
  launcher and profile, leaving plain pi untouched (D20);
  a self-contained dispatch tool with no `pi-subagents` dependency; persona on by default inside
  the launcher with a command to switch it off; name and trailer (D22); the routing pass bar
  (D24); the private GitHub remote (D25); one third-party web package installed by setup; no codex-critic,
  an optional critic model from another provider; four tiers with the source's per-dispatch
  overrides, named generically per D6 (`top`, `strong`, `standard`, `fast`); easy setup; functional parity. Brief defaults also kept: provider-agnostic tiers
  saved as `provider/id`; literal slash names; no bash gate; full skill injection.
- Memory: `.supervisor/memory/` is empty; no entries apply.

## Assumptions

- A child loads the packages of its profile by default: checked in P1 slice 1b (`nested`,
  `child_profile`).
- pi writes `auth.json` through a symlink and keeps the link: checked in P0
  (`auth_link_write_through`).
- The managed `pi` wrapper runs with any `PI_CODING_AGENT_DIR`: checked in P0 (`launcher_runs`).
- `gh` is installed and logged in for `sly2j`: checked in P0 before `gh repo create`; if not,
  P0 stops after the local commit and reports.
- `before_agent_start` fires in print and JSON mode: checked in P1 slice 1a
  (`child_sees_prompt`).
- `registerCommand` accepts hyphenated names: checked in P2 (`close_out_command`).
- `--session-dir` works together with `-p --mode json`: checked in P1 slice 1b (`sessions`).
- `ctx.reload()` (`PI/dist/core/extensions/types.d.ts:342`) is callable from a command
  handler: checked in P2; the fallback is telling the user to run `/reload`.
- pi's `parseFrontmatter` returns list values for `skills`: checked in P1 slice 1a
  (`child_sees_prompt` runs through pi's parser).
- `pytest` is importable by `python3`: checked in P5; otherwise P5 creates a project venv per
  the `python-env` skill and `CLAUDE.md` names it.
- Node 22.19 or later is present wherever pi 1.5 runs: checked by the doctor.

## Work Packages

### P0: Bootstrap
- Goal: make the directory a git project with an empty package behind the `pi-supervisor`
  launcher, pushed to the private remote; done when the slice 1 checkpoint passes
- Owns: `package.json`, `CLAUDE.md`, `LICENSE`, `.gitignore`, `install`, `tests/test_install.py`
- Deps: none
- Stages: execute
- Status: done
- Artifacts: -

### P1: Dispatch core and nested proof
- Goal: prove nested dispatch with per-child model, tool restriction and injected skills; done
  when the slice 2 checkpoints pass and the checklist findings are logged
- Owns: `extensions/supervisor/{index,agents,tiers,dispatch}.ts`, `tests/node/{agents,tiers,
  dispatch}*.test.ts`, `tests/fixtures/`
- Deps: P0
- Stages: execute
- Status: done
- Artifacts: -

### P5: Memory tool
- Goal: port the external-store commands; done when `tests/test_memory.py` passes
- Owns: `skills/project-memory/scripts/memory`, `tests/test_memory.py`
- Deps: P0
- Stages: execute
- Status: done
- Artifacts: -

### P2: Setup, persona and commands
- Goal: the setup experience, persona activation and the literal slash commands; done when the
  slice 4 checkpoint passes
- Owns: `extensions/supervisor/{setup,persona,doctor,commands}.ts`, their `tests/node/` files, `extensions/supervisor/index.ts`, `tests/node/skills.real.test.ts`, `tests/fixtures/rpc.ts`, `tests/fixtures/p2/`, `tests/fixtures/harness.ts`, `tests/fixtures/scripted-provider/index.ts`, and the P2-D14 lines in `skills/close-out/SKILL.md`, `skills/pick-up/SKILL.md`, `agents/supervisor.md`, `tests/test_skills_lint.py`, `tests/test_agents_lint.py`
- Deps: P1
- Stages: plan, execute
- Status: done
- Artifacts: `.supervisor/working/plans/plan-pi-supervisor-port-P2.md`

### P3: Agents port
- Goal: 15 agent files under D12; done when `tests/test_agents_lint.py` passes
- Owns: `agents/`, `tests/test_agents_lint.py`
- Deps: P1
- Stages: execute
- Status: done
- Artifacts: -

### P4: Skills port
- Goal: 16 skills with references, templates and `backup.sh` under D12; done when
  `tests/test_skills_lint.py` passes
- Owns: `skills/` except `skills/project-memory/scripts/`, `tests/test_skills_lint.py`
- Deps: P1
- Stages: execute
- Status: done
- Artifacts: -

### P6: Validation
- Goal: cross-pack lint, routing test, end-to-end runs and the parity record; done
  when the slice 7 checkpoint passes
- Owns: `tests/test_pack_cross.py`, `tests/test_live_routing.py`, `docs/parity.md`,
  `tests/live.py`, `tests/test_live_e2e.py`, `tests/fixtures/live-stop/`,
  `tests/fixtures/e2e-repo/`, and the P6-D10 tuning lines in `agents/supervisor.md` and the
  routed agents' `description:` lines
- Deps: P2, P3, P4, P5
- Stages: plan, execute
- Status: execute
- Artifacts: `.supervisor/working/plans/plan-pi-supervisor-port-P6.md`

### P7: Docs
- Goal: README and user docs for install, setup, architecture, memory and lifecycle; done when
  the slice 8 checkpoint passes
- Owns: `README.md`, `docs/` except `docs/parity.md`
- Deps: P2, P3, P4, P5
- Stages: write
- Status: done
- Artifacts: -

Waves: P0; then P1 and P5; then P2, P3 and P4; then P6 and P7.

## Open Questions

None here. The P6 model usage question is open question 1 of
`.supervisor/working/plans/plan-pi-supervisor-port-P6.md`.

## Log

- decision: tier names are generic (top / strong / standard / fast), not Anthropic model names (user, 2026-11-14)
- 2026-11-15 decision: dedicated `pi-supervisor` launcher with its own agent directory; plain pi and other pi setups stay untouched (D20, D21); source: user
- 2026-11-15 decision: product name "Supervisor for Pi", trailer `Co-Authored-By: Supervisor for Pi` (D22); source: user
- 2026-11-15 decision: P1 slice 1c live nested run approved, on the `openai-codex` subscription login with `OPENAI_API_KEY` as fallback (D23); source: user
- 2026-11-15 decision: routing pass bar 24 of 28 for sign-off, target 28 of 28, every failure listed with a tuning follow-up (D24); source: user
- 2026-11-15 decision: plan approved with the dedicated-launcher change; source: user
- 2026-11-15 decision: create the private GitHub repo `sly2j/pi-supervisor`, add it as `origin`, push `main` in P0 and after each landed package (D25); source: user
- 2026-11-15 P0: done; repo bootstrapped (commit 901f575), install and launcher with 16 tests passing, private repo sly2j/pi-supervisor created and main pushed; deferred: none (commit trailer is Supervisor for Pi per D22, the brief said Claude trailer; plan Todo ticks left uncommitted)
- 2026-11-15 decision: this repository's own commits use the trailer `Co-Authored-By: Supervisor for Pi` (D22 and the repo CLAUDE.md); commit 901f575 stands, no history rewrite; source: supervisor
- 2026-11-15 P5: done; memory script and 24 tests landed (097b622) and pushed; the tests use a stub store-readme template, so P4 must ship `skills/project-memory/templates/store-readme.md`; deferred: none
- 2026-11-15 P1: done; dispatch core landed (a6f9725, pushed); faux provider via extension works; before_agent_start fires in print mode; children load profile packages (project-local only when trusted in the profile); pi-web-access tools visible in children, no fix needed; unknown skill keys load silently; live nested run on openai-codex (gpt-5.6-luna lead, gpt-6-luna worker/critic) returned "worker: ZEBRA-41 / critic: CRITIC-OK", 7448 in/262 out tokens, about 0.0016 USD at catalog prices; deferred: CLAUDE.md test command fix (`node --test`), outside P1's files
- 2026-11-15 decision: P1 deviations accepted: child sessions live under the parent's own session id; `dispatch` is registered at every depth and refuses at depth 2 or more; check command is `node --test`; source: supervisor
- 2026-11-15 decision: pi's default tools are read, bash, edit, write, so P3 adds grep, find and ls explicitly to agents whose source had Grep or Glob; source: P1 finding
- 2026-11-15 P3: 15 agents ported under D12 to `agents/` with `tests/test_agents_lint.py` (123 lint tests) and a real-load node test; landed as 27b69fc and pushed; deferred: none (`agent_skill_refs_exist` stays with P6)
- 2026-11-15 P4: 16 skills ported by D12 with tests/test_skills_lint.py, landed a44eefe and pushed; deferred: "/clear" wording in close-out and pick-up (no D12 row), P1 scripted-provider skill-warning run not executed
- 2026-11-15 P2: plan done, child plan plan-pi-supervisor-port-P2.md (4 slices, critic PASS round 2); includes /clear -> /new (P2-D14) and six Amend parent items listed in its Scope Notes; deferred: none
- 2026-11-15 decision: P3 uses explicit `tools` allowlists for every agent instead of exclude lists, so grep, find and ls are kept; source: P3 finding, accepted by supervisor
- 2026-11-15 decision: pi's session reset is `/new`; "safe to /clear" wording becomes "safe to /new" in P2 slice 4, which also takes the skill-warning check P4 skipped; source: P2 plan
- 2026-11-15 P2: done, `2e34f58` pushed to origin/main; 71 node and 244 pytest checks pass; deferred: manual TUI verification run (TUI reload, real `pi-web-access` install, Anthropic OAuth notice)
- 2026-11-15 decision: P2 deviations accepted: persona refreshes the model registry once when `top` shows no credentials at session start; Escape on a confirm counts as "no"; re-running the wizard re-asks the critic question; the wizard turns the persona on before reload; `/project-backup` runs the script with bash; source: supervisor
- 2026-11-15 P7: done; README.md and docs/{setup,architecture,memory,workflow-lifecycle,context-engineering}.md written and committed (7a2cef2, pushed); critic codex gpt-6.1-sol PASS round 2; nine code-versus-plan differences documented per the code; deferred: README status paragraph update after P6, docs_paths_exist test (P6's)
- 2026-11-15 P6: plan done, child plan plan-pi-supervisor-port-P6.md (5 slices, staged live spend A-E with cost caps, critic PASS round 2), three Amend parent items in its Scope Notes; deferred: live runs and tuning await the user's spend decision
- 2026-11-15 decision: three code wording follow-ups from P7 fixed directly (wizard tier role labels, agent-authoring tools wording, doctor.ts comment); source: supervisor
- 2026-11-15 decision: P6 token-free slices (cross lint, fixtures, parity record skeleton) start now; live stages A-E stay blocked until the user approves the spend; source: supervisor

## Todo

- [x] P0: `git init -b main`; write `package.json` (D1), `CLAUDE.md` (D16 check commands, D18
      versioning line, commit style with the D22 trailer), `LICENSE`, `.gitignore` (D25)
- [x] P0: write `install` (D20, D21) and `tests/test_install.py`; tests pass
- [x] P0: first commit with `.supervisor/`; `no_secrets` passes; `gh repo create
      sly2j/pi-supervisor --private`; add `origin`; push `main`
- [x] P1 1a: `agents.ts`, `tiers.ts`, `dispatch.ts`, `index.ts`, scripted-provider fixture;
      one restricted child end to end
- [x] P1 1b: nesting, depth cap, parallelism, abort, child sessions
- [x] P1 checklist: log the five findings; apply the D3 or D13 fallback if a finding requires it
- [x] P1 1b: `child_profile`
- [x] P1 1c: live nested run in the launcher's profile on `openai-codex` (D23); log the route
- [x] P5: port `CS/deploy:2140-2433` to `skills/project-memory/scripts/memory`; port the tests
- [x] P2: child plan, then execute (wizard, persona, doctor, commands)
- [x] P3: copy and adapt 15 agents by D12; write `tests/test_agents_lint.py`
- [x] P4: copy and adapt 16 skills and their support files by D12; write
      `tests/test_skills_lint.py`
- [ ] P6: child plan, then execute (cross lint, routing test, end-to-end runs,
      `docs/parity.md`)
- [x] P7: write `README.md` and `docs/`
- [ ] After each package lands: push `main` to `origin` (D25)
- [ ] Verification: temporary-profile install and full check; uninstall leaves `~/.pi/agent`
      unchanged; set version `1.0.0`; push
- [ ] Close-out: `curator` close-out of this plan
