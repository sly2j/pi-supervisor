# Research: porting claude-supervisor to the pi coding harness

Date: 2026-11-14. Stage: research only (feeds planner). No design decisions are made here.

## Scope

How the `claude-supervisor` agent pack (v10.2) can be rebuilt as a pi package with four model tiers, and where pi cannot match Claude Code. It covers five questions: the source inventory, pi's extension surface, subagents in pi, models and auth, and a feature mapping. It also surveys existing pi subagent packages. Out of scope: the plan, the architecture choice, and any code.

### Path abbreviations

| Short | Path |
|---|---|
| `CS/` | the clone, `/Users/sjoosten/Work/pi-supervisor-work/claude-supervisor/` (read-only, v10.2 per `CS/VERSION`) |
| `PI/` | `/Users/sjoosten/.pi/agent/install/releases/1.5.2/node_modules/@earendil-works/pi-coding-agent/` |
| `PI/docs/` | pi's bundled docs, which match the installed version |
| `PI/ex/` | `PI/examples/extensions/` |

### Labels

- **V**: verified in the cited file, a command run, or a URL.
- **I**: inference.
- **U**: unverified.

## Which pi, and which version

- **V** pi is `@earendil-works/pi-coding-agent` 1.5.2 (`pi --version`; managed install under `~/.pi/agent/install/releases/1.5.2`). Its repository is `github.com/earendil-works/pi` (formerly `pi-mono`, per CHANGELOG links). The legacy `@mariozechner/pi-coding-agent` (0.73.1) is deprecated in its favour. npm `latest` equals the local 1.5.2. The identity is not ambiguous, and every pi claim below applies to 1.5.2.
- **V** Ambient credentials: `pi auth check --provider openai --json` reports `ready` via `api_key`, because `OPENAI_API_KEY` is set in the shell. Anthropic reports `not_ready`. `~/.pi/agent/auth.json` is `{}`.

## Q1. Inventory of claude-supervisor

### Agents

There are 15 agents, in `CS/pack/agents/*.md`. **V** The frontmatter below was re-read for all 15 files. "Allow" means a `tools:` allowlist; "deny" means a `disallowedTools:` list; "all" means no restriction.

| Agent | Kind | Tier (`model:`) | Tools | Preloaded skills | Dispatches |
|---|---|---|---|---|---|
| supervisor | main thread | fable | deny Bash, NotebookEdit | none | leads, Mode 2 specialists, curator |
| researcher | lead | opus | all | lead-loop, residue | researcher-worker, critic, scope-critic |
| planner | lead | opus (fable per dispatch) | all | lead-loop, plan-writing, repo-workflow | planner-worker, critic, scope-critic |
| executor | lead | sonnet (opus per dispatch) | all | lead-loop, git-safety, repo-workflow, residue | executor-worker, critic, scope-critic |
| writer | lead | fable (opus per dispatch) | all | lead-loop, project-memory | writer-worker, critic, scope-critic |
| researcher-worker | worker | sonnet | deny Agent, Edit, NotebookEdit | residue | none |
| planner-worker | worker | sonnet | deny Agent, Write, Edit, NotebookEdit | none | none |
| executor-worker | worker | sonnet | deny Agent | residue | none |
| writer-worker | worker | opus | deny Agent | project-memory | none |
| critic | reviewer | opus (fable per dispatch) | deny Write, Edit, NotebookEdit, Agent | none; loads domain skills on demand | none |
| scope-critic | reviewer | fable | deny Write, Edit, NotebookEdit, Agent, Bash | none | none |
| fixer | Mode 2 | haiku, `effort: xhigh` | allow Read, Edit, Write, Glob, Grep, Bash | project-memory, residue | none |
| git-ops | Mode 2 | haiku, `effort: xhigh` | allow Bash, Read, Glob, Grep | git-safety, repo-workflow | none |
| scout | Mode 2 | haiku, `effort: xhigh` | deny Write, Edit, NotebookEdit, Agent | none | none |
| curator | memory | sonnet | allow Read, Edit, Write, Glob, Grep, Bash | project-memory | none |

How dispatch rules are enforced:
- **V** Only prompt text enforces which agent may dispatch which (`CS/docs/architecture.md`, Platform Constraints).
- **V** `CS/tests/test_pack_lint.py:138-179` checks that prompt text: leaves never spawn, and leads name only their own worker plus critic and scope-critic.

### Main thread and protocol

- **V** The supervisor becomes the main thread because `deploy install` writes `"agent": "supervisor"` into the profile's `settings.json` (`CS/deploy` lines 631-667). It is not an output style or CLAUDE.md.
- **V** Routing (`CS/pack/agents/supervisor.md`) has three outcomes:
  - Mode 1 sends the request to one lead, chained as researcher, planner, user approval, executor.
  - Mode 2 sends it to fixer, git-ops or scout, with no review and an `ESCALATE:` fallback.
  - The supervisor answers directly when no dispatch is needed.
- **V** Programs run in work-package waves with a post-wave fixer, curator and git-ops (`supervisor.md:57-89`).
- **V** The lead protocol is in `CS/pack/skills/lead-loop/SKILL.md`:
  1. Write a contract.
  2. Fan out 1-6 disjoint units, all in one message (parallel).
  3. Integrate the results.
  4. Run critic, then scope-critic (never in parallel).
  5. Combine the reviews with a decision table.
  6. Loop for at most 3 rounds, with a stalemate rule.
  7. Return a bounded report.
- **V** Subagents cannot ask the user questions. Leads return questions to the supervisor (`supervisor.md`).
- **V** Nesting depth is main, then lead, then worker or reviewer, which is depth 2. Mode 1 needs `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` of at least 2 (`CS/docs/architecture.md`).

### Skills

There are 17 skills, in `CS/pack/skills/`. Preloading uses the agent frontmatter `skills:` (see the agent table).

- **Preloaded:** lead-loop, plan-writing, repo-workflow and residue (all `user-invocable: false`), plus project-memory and git-safety.
- **Loaded on demand:** python-env, agent-authoring, science-writing-style, presentation-style, document-extraction and email-extraction.
- **User-only** (`disable-model-invocation`): close-out, pick-up, project-backup (`context: fork`, `scripts/backup.sh`) and supervisor-config (uses AskUserQuestion).
- **User or writer-worker:** meeting-summary (`context: fork`).
- **V** Skills use the substitutions `$ARGUMENTS` and `${CLAUDE_SKILL_DIR}` (project-memory, repo-workflow, project-backup, supervisor-config).

The codex-critic script, `CS/pack/skills/supervisor-config/scripts/codex-critic` (461 lines, stdlib Python):
- **V** It is an optional review backend. `enable` checks the `codex` CLI and its login, asks for consent, and writes `<config>/supervisor-config.json`. The default model is `gpt-6.1-sol` at effort `high`.
- **V** `review --probe` prints either `codex <model> <effort>` or `claude`.
- **V** `review` runs `codex exec -s read-only --ephemeral ...` and validates the `VERDICT:` block strictly. On any failure it prints `NO_CODEX`, and the lead falls back to the in-harness critic.
- **V** Deploy adds `Bash(<script> review *)` to `permissions.allow`.

### Model tiers

- **V** There are four tier aliases: fable, opus, sonnet and haiku (`CS/tests/test_pack_lint.py:19` also allows `inherit`). Each agent gets its tier from its `model:` frontmatter (see the agent table).
- **V** Per-dispatch overrides use the `Agent` tool's `model` parameter. Only these are allowed (`CS/pack/skills/agent-authoring/SKILL.md:24-29`):
  - planner: fable
  - critic of a fable-tier plan: fable
  - executor: opus, for difficult work
  - writer: opus, for short, low-stakes prose
- **V** Effort: only fixer, git-ops and scout set `effort: xhigh`.
- **V** Remapping is done with environment variables (`CS/deploy:158-165`, `CS/docs/deploy.md`):
  - `--fable-is-opus` sets `ANTHROPIC_DEFAULT_FABLE_MODEL`.
  - The provider profiles (`--provider openrouter|nrp|alcf|argo` and `--model-fable/opus/sonnet/haiku`) export `ANTHROPIC_DEFAULT_<TIER>_MODEL`.
  - `doctor` warns when `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` or `CLAUDE_CODE_EFFORT_LEVEL` would flatten the tiers.
- **V** The live routing test asserts the supervisor's `(mode, agent, model)` choice for 28 cases (`CS/tests/test_live_routing.py`).

### Hooks, settings, permissions

**V** The pack has no hooks, no statusline and no output style. `CS/deploy` writes these settings:
- `agent`
- `attribution` (commit trailer `Co-Authored-By: Supervisor for Claude`)
- `permissions.allow`: the codex-critic review rule, and Edit on the memory root
- `permissions.additionalDirectories`: the memory root
- `apiKeyHelper`, for provider profiles

The launcher exports `CLAUDE_CONFIG_DIR`, `ANTHROPIC_*` variables and the tier model variables.

### Memory store

**V** The store is described in `CS/pack/skills/project-memory/SKILL.md` and `CS/docs/local-memory.md`. Its layout:

```
.supervisor/
  README.md
  history.md
  tasks/
  memory/{decisions,facts,lessons,goals,conventions}/
  working/{writing,research,plans,residue}/
  archive/
```

- Entries carry `summary`, `affects`, `verified`, `source` and `supersedes`. Retrieval is `grep` over `summary:` and `affects:`. An entry is superseded and archived, never edited.
- Task cards are claimed by compare-and-set.
- The residue ledger lives under `working/residue/` and is listed in `.git/info/exclude`.
- Store modes are tracked, local or external. External means it lives under `~/.local/share/claude-supervisor/memory/<name>` and is reached through symlinks. The link is recorded in `CLAUDE.local.md`, handled by the `deploy memory externalize|link|status` commands.
- The store is plain Markdown plus git, with no harness API. **I** It is portable as is, apart from the `CLAUDE.local.md` link file (see the gap list).

### Install, setup, update

`CS/deploy` is a single 2,600-line Python 3.9 script. Its subcommands are `install|update|status|list|uninstall|migrate|doctor|memory|critic`.

- **V** It copies `pack/agents` and `pack/skills` into a config profile, `~/.config/claude-supervisor` by default.
- **V** It keeps a sha256 manifest and does a three-way reconcile of user edits.
- **V** It merges settings, and on the first install it seeds the profile from `~/.claude`.
- **V** It writes a launcher, `~/.local/bin/claude-supervisor`, which sets `CLAUDE_CONFIG_DIR` and then runs `exec claude`.
- **V** It registers the install, so `update` can re-clone the branch.
- **V** `doctor` checks Python, the `claude` version (2.1.293 or later), the manifest, settings, environment variables, git, zip and the codex login.
- **V** The user experience is `git clone`, then `./deploy install`, then `claude-supervisor` (`CS/docs/deploy.md`).

### Tests and tools

**V** `CS/tests/test_pack_lint.py` guards the pack invariants (tiers, tools, preloads, dispatch rules, word caps, attribution). `test_deploy*.py` and `test_codex_critic.py` guard the installer and the codex backend (stub `codex`). `test_live_routing.py` (opt-in, model calls) and `tools/audit/audit.py` (Claude Code transcripts) are harness-specific.

### Claude Code features the pack relies on

- **V** These features are used:
  - the `Agent` tool with `subagent_type` and a per-call `model`, plus parallel dispatch in one message
  - agent frontmatter `model`, `effort`, `tools`, `disallowedTools` and `skills`
  - skill frontmatter `user-invocable`, `disable-model-invocation`, `context: fork` and `argument-hint`
  - `$ARGUMENTS` and `${CLAUDE_SKILL_DIR}`
  - the settings keys `agent` and `attribution`, and `permissions`
  - nested spawn depth 2
  - `CLAUDE_CONFIG_DIR` profiles
  - `ANTHROPIC_DEFAULT_*_MODEL`
  - AskUserQuestion
  - WebSearch and WebFetch (researcher-worker, scout)
  - the Claude tool names Read, Edit, Write, Glob, Grep, Bash and NotebookEdit
  - CLAUDE.md and CLAUDE.local.md
- **V** These features are not used in `pack/` (grep): SendMessage, SubagentHandback, TaskStop, plan mode, the Artifact tool, `run_in_background`, `isolation:`, and hooks.

## Q2. pi's extension surface

### What a pi "plugin" is

- **V** A pi plugin is a **pi package** (`PI/docs/packages.md`). It is a `package.json` with a `pi` key that lists `extensions`, `skills`, `prompts` and `themes`.
- **V** These entries accept globs. Without the key, pi discovers the conventional directories.
- **V** The keyword `pi-package` lists the package in the gallery at pi.dev/packages.
- **V** Host libraries (`@earendil-works/pi-ai`, `pi-agent-core`, `pi-coding-agent`, `pi-tui`, `typebox`) must be `peerDependencies` with `"*"`.

### Installing and updating

**V** Source: `PI/docs/packages.md` and `pi install --help`.

| Action | Command or mechanism |
|---|---|
| Install | `pi install npm:@x/y@ver`, `git:github.com/u/r@ref`, an https or ssh git URL, or a local path |
| Remove | `pi remove` |
| Update | `pi update [src\|--all]` |
| Inspect | `pi list` |
| Enable or disable resources | `pi config` (a TUI) |
| Try without installing | `pi -e <src>` |
| Scope | global by default (`~/.pi/agent/settings.json`), or project with `-l` (`.pi/settings.json`) |
| Pin | versions and refs pin the package |
| Filter resources | the object form of a `packages` entry |

- **V** Project resources need project trust (`PI/docs/security.md:61-82`). The decision order is a CLI `--approve` / `--no-approve`, then an extension's `project_trust` handler, then a saved decision in `~/.pi/agent/trust.json` (`/trust`), then `defaultProjectTrust` (default `ask`). Print and JSON mode cannot prompt. If none of the earlier sources decides, they load project resources only when the default is `always`.
- **V** `PI_CODING_AGENT_DIR` relocates the whole agent directory (`PI/docs/environment-variables.md`), which is the equivalent of `CLAUDE_CONFIG_DIR`.

### The extension API

Extensions are TypeScript loaded with jiti, with no build step. Entry point: `export default function (pi: ExtensionAPI)`. All of the following is **V**, from `PI/docs/extensions.md` and `PI/dist/core/extensions/types.d.ts`.

- **Tools:** `pi.registerTool({name, description, parameters, execute(id, params, signal, onUpdate, ctx), renderCall, renderResult, ...})`.
  - A tool can override a built-in by reusing its name.
  - `execute` can return `terminate: true`.
- **Commands and options:** `pi.registerCommand`, `pi.registerShortcut`, and `pi.registerFlag` (the flag appears in `pi --help`).
- **Events:**
  - session: `session_start` (with a reason) and `session_shutdown`
  - agent run: `before_agent_start`, `agent_end`, `turn_*`, `message_*`
  - model request: `context`, `before_provider_request`
  - model change: `model_select`
  - tools: `tool_call` (can block or rewrite the input; a throw fails closed) and `tool_result` (can patch the result)
  - input: `input` (transform or handle the user's text)
  - resources: `resources_discover` (add skill, prompt and theme paths)
  - project: `project_trust`
- **System prompt:**
  - `before_agent_start` can return `{systemPrompt}` to replace the prompt for that run, or edit `event.systemPromptOptions`: sections, `selectedTools`, `appendSystemPrompt`, skills and context files.
  - Static overrides are `SYSTEM.md` and `APPEND_SYSTEM.md`, global or project.
- **Model, thinking and tools:**
  - `pi.setModel(model)`, which returns false when there is no auth and lasts only for the session.
  - `pi.setThinkingLevel`, `pi.setActiveTools(names)`, `pi.getAllTools()`.
  - `ctx.modelRegistry`: `getAll`, `getAvailable`, `find`, `getProviderAuthStatus`.
- **UI:** `ctx.ui.select`, `confirm`, `input`, `editor`, `notify`, `setStatus`, `setWidget`, and `custom` components.
  - `ctx.hasUI` is false in print and JSON mode.
- **State:**
  - `pi.appendEntry` writes session entries the model does not see.
  - `pi.sendMessage(..., {deliverAs: "steer"|"followUp"|"nextTurn", triggerTurn})` adds messages the model does see.
  - An extension can write its own files under `getAgentDir()` (see `PI/ex/preset.ts`).
  - `pi.getSettings()` is read-only. No API writes `settings.json`. `SettingsManager` is exported, but **U** whether it is safe to use from inside a session is unverified.
- **Other:**
  - `pi.exec(cmd, args, {timeout, cwd, signal})` runs a command.
  - `pi.events` is an event bus between extensions.
  - `pi.registerProvider`, `pi.registerVirtualModel` and `pi.registerMcpServer` are available.
  - Built-in MCP support is configured in `mcp.json`.

### Skills

**V** Source: `PI/docs/skills.md`.

- pi implements the Agent Skills spec: a directory with a `SKILL.md` and optional `scripts/` and `references/`.
- **Frontmatter:**
  - Recognised keys: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` (experimental) and `disable-model-invocation`.
  - Names are lowercase with hyphens, at most 64 characters. All claude-supervisor skill names already comply.
  - **U** Unknown keys such as `user-invocable`, `context: fork` and `argument-hint` are not documented. **I** pi probably ignores them.
- **Disclosure:** progressive. Only the name, description and path go into the system prompt, and the model reads `SKILL.md` itself. The docs warn the model "might fail to load a relevant skill".
- **Forcing a skill:** `/skill:name [args]`.
- **Preloading:** there is no frontmatter preload for an agent, and no pi skill mechanism injects a skill body. **V** `formatSkillsForPrompt` (`PI/dist/core/skills.js:278-300`) renders only name, description and location. SDK inline skills (`PI/examples/sdk/04-skills.ts:18-34`) carry the same metadata, and `--skill` adds a skill to the same catalog. **V** pi-subagents' `skills:` also lists metadata for the child to read on demand (critic round 1, citing https://github.com/nicobailon/pi-subagents/blob/v0.88.1/docs/agents.md#skills). **I** The one workaround that gives Claude-style preloading is to inject the full SKILL.md body into the child's system prompt, for example through `--append-system-prompt`, `appendSystemPromptOverride`, or `before_agent_start`.
- **Substitutions:** **U** `${CLAUDE_SKILL_DIR}` and `$ARGUMENTS` inside a SKILL.md are not documented for pi. Prompt templates do support `$1` and `$ARGUMENTS`.

### Prompt templates and context files

- **V** Prompt templates (`PI/docs/prompt-templates.md`) are Markdown files run as `/name args`. Frontmatter takes `description` and `argument-hint`, but no model or tools.
- **V** Context files (`PI/docs/configuration.md`): pi loads `AGENTS.override.md`, `AGENTS.md` or `CLAUDE.md` from the agent dir, the cwd and its parents. `CLAUDE.local.md` is not in the list.

### What pi says it lacks

- **V** `PI/README.md:19`: "Pi ... skips features like sub-agents and plan mode."
- **V** There is no permission or approval system. "Trust is not a sandbox" (`PI/docs/security.md`). Gating has to come from the `tool_call` event (`PI/ex/permission-gate.ts`, `protected-paths.ts`) or a container.
- **V** pi has no web search or fetch tool. A grep of `PI/docs` finds none. The built-in tools are `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, `powershell`, `codemode` and `tool_search` (`PI/docs/settings.md`).
- **V** Web access comes from extras: `badlogic/pi-skills` ships `brave-search` and `browser-tools` skills (`gh api repos/badlogic/pi-skills/contents`), and `pi-subagents` docs point to `nicobailon/pi-web-access`.

## Q3. Subagents in pi

### No native support

- **V** pi has no native subagents (`PI/README.md:19`).

### The bundled example

The example lives in `PI/ex/subagent/` (`index.ts` 1257 lines, `agents.ts`). **V**, re-checked at `index.ts:38-39` and `389-396`:

- Each child is a separate process: `pi --mode json -p --no-session [--model m] [--thinking l] [--tools a,b]`, with the agent body passed via `--append-system-prompt <tmpfile>`.
- The parent reads the child's JSONL events.
- Agents are Markdown files with frontmatter `name`, `description`, `tools` and `model`. They live in `~/.pi/agent/agents/` or `.pi/agents/`, and project agents need a confirmation.
- Modes: single, parallel (at most 8 tasks, 4 running at once) or chain.
- Abort sends SIGTERM, then SIGKILL.
- Model and thinking: a per-agent model is supported. The parent's thinking level is passed only when the agent has no model.
- Not supported: a per-dispatch model, background runs, resume, messaging a running child, worktrees, and a depth guard.
- Children load extensions and skills normally. **I** If the subagent tool is installed globally and is not excluded by `--tools`, a child could recurse without limit.

### The SDK path

**V** Source: `PI/docs/sdk.md` and `PI/dist/core/sdk.d.ts`. The SDK can run a child in the same process:

- `createAgentSession({model, thinkingLevel, tools, excludeTools, customTools, resourceLoader, sessionManager: SessionManager.inMemory(), cwd})`.
- The system prompt can be replaced or appended through `DefaultResourceLoader({systemPromptOverride, appendSystemPromptOverride})`.
- Skills can be supplied inline (`examples/sdk/04-skills.ts`). This adds catalog metadata only, not the skill body (see Q2, Skills).
- A running session takes `steer()`, `followUp()`, `abort()` and repeated `prompt()` calls.
- **I** The trade-off: in-process children die with the parent and have no OS isolation. Subprocesses give crash isolation and are easy to detach.

### Community packages

**V** Data from `npm view` and `gh api` on 2026-11-14. All are MIT.

| Package | Version / date | Stars | Notable |
|---|---|---|---|
| `pi-subagents` (github.com/nicobailon/pi-subagents) | 0.88.1, 2026-11-13 | ~4.2k | See the feature list below. Needs pi 1.2.0 or later. |
| `pi-subagent-manager` (championswimmer) | 1.8.0, 2026-11-14 | 118 | Hierarchical delegation; steer or resume a finished agent; per-role model and tools |
| `@agwab/pi-subagent` | 0.7.2, 2026-10-16 | 49 | Git worktrees, network-deny sandbox, async; validated on pi 0.84.4 |
| `@ravshansbox/pi-subagent` | 2.10.1, 2026-11-13 | 1 | The bundled example plus `background: true` and `subagent.maxDepth` (default 2) |
| `@kevinhao/pi-subagent` | 1.2.2, 2026-11-02 | 0 | One tmux session per agent, with durable sessions |

**V** `pi-subagents` features, from its README and `docs/agents.md` (fetched with `gh api`):
- Children run in-process by default. Background runs use a detached runner and wake the parent when they finish.
- Parallel, chains and workflows.
- Worktrees.
- `outputSchema`.
- Steer, stop and resume.
- Nesting is capped by `maxSubagentDepth` (default 2). A child nests only when it has the `subagent` tool or `allowNestedSubagents`. `allowedAgents` narrows which agents a child may launch.
- Agent frontmatter keys: `tools` (a strict allowlist), `excludeTools`, `model` (with a `:level` suffix), `thinking`, `systemPromptMode: replace|append`, `skills`, `inheritSkills`, `extensions` and `subagentOnlyExtensions`.
- Packages can ship agents through `{"pi":{"subagents":{"agents":["./agents"]}}}`. Package agents rank above the built-ins and below user and project agents.
- It ships built-in agents named `scout`, `researcher`, `worker`, `reviewer`, `oracle` and `delegate`. Two of these (`scout`, `researcher`) collide with claude-supervisor names. A package agent shadows a built-in of the same name, and `subagents.disableBuiltins` turns them off.
- Built-in agents inherit the session's model unless `subagents.defaultModel` or `subagents.agentOverrides.<name>.model` is set.
- **V** `skills:` selects which skills the child sees as metadata. It does not inject skill bodies, so it is not Claude-style preloading (pinned `docs/agents.md#skills`, critic round 1).
- **V** Custom agents exclude project context files and the discovered skills catalog by default. `inheritProjectContext`, `inheritGlobalContext` and `inheritSkills` turn them back on (pinned `docs/agents.md#prompt-assembly`). claude-supervisor children need both: repository instructions take precedence in `CS/pack/skills/repo-workflow/SKILL.md:9`, and writer-worker loads named domain skills (`CS/pack/agents/writer-worker.md:17,29`).
- **I** It is the only surveyed package that enforces claude-supervisor's dispatch topology (`allowedAgents` plus a depth cap). It is large and fast-moving (0.x with frequent releases).

**V** Every Agent-tool capability missing from the example can be built in an extension: background with a completion notice via `pi.sendMessage({triggerTurn})` (`PI/docs/extensions.md`), messaging or resume via SDK `steer` or `--session <id>`, and worktrees via `git worktree` plus `cwd`. The subagent worker found no capability that cannot be built. The smoke test only parsed the flags (`pi -p --mode json --no-session --no-extensions --model ... --tools read,grep` printed the session header and then "No API key found"). No child ran end to end.

## Q4. Models and auth in pi

### Providers and logins

**V** pi has about 45 providers (`PI/docs/providers.md`, `node_modules/@earendil-works/pi-ai/README.md`).

- **Subscription or OAuth login:** `anthropic` (Claude Pro/Max), `openai` (ChatGPT), `openai-codex` (Plus/Pro, OAuth only), `github-copilot`, `openrouter` (the login mints a key), `xai`, `kimi-coding`, `meta` and `radius`.
- **API key or cloud credentials:** google (`GEMINI_API_KEY`), google-vertex, amazon-bedrock, azure, mistral, groq, deepseek, together, fireworks, and others.
- **Not in 1.5.2:** Gemini CLI or Antigravity OAuth.
- **V** Billing caveat for Anthropic subscriptions: pi prints at runtime "Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits." A multi-agent supervisor running on a Claude subscription therefore bills per token.

### Supplying credentials

**V** Sources: `PI/docs/providers.md`, `models.md`, `models-configuration.md`, `custom-provider.md`, and `pi auth --help`.

- **Login:** `pi auth login <provider> [--api-key]` (needs a terminal), or `/login` in the TUI.
- **Storage:** `~/.pi/agent/auth.json`, one entry per provider. A key may be a literal or a `!command`.
- **Readiness probe:** `pi auth check --provider X --json`, with exit codes 0 (ready), 1 (not ready) and 2 (invalid).
- **Other sources:** provider environment variables, and a one-off `--api-key`.
- **Resolution order:** `--api-key`, then `auth.json`, then a `models.json` key, then environment variables. `ModelRegistry.getProviderAuthStatus` reports which source won.
- **Custom providers:** `~/.pi/agent/models.json` defines OpenAI-compatible endpoints, Ollama, and the built-in llama.cpp route. `pi.registerProvider` can add OAuth.

### Selecting a model

- **V** Patterns are `provider/id[:thinking]`, fuzzy-matched. When several providers match, pi prefers the one with credentials.
- **V** Settings: `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `modelThinkingLevels` and `enabledModels`. In the TUI, `/model` and Ctrl+P switch models.
- **V** A child process takes `--model` and `--thinking`. An in-process child takes `createAgentSession({model, thinkingLevel})`.
- **V** Model IDs differ by provider: `claude-sonnet-5-5` on Anthropic, `claude-sonnet-5.5` on Copilot, `anthropic/claude-sonnet-5.5` on OpenRouter. A tier mapping must store `provider/id`.
- **V** Virtual models (`PI/docs/virtual-models.md`): `pi.registerVirtualModel({provider, id, route()})` defines a routing model under any provider name, which makes a name like `tier/fast` possible.
  - A virtual model can only route to physical models that have credentials.
  - **I** A child would select `--model tier/fast` and needs the extension loaded to resolve it.

### Interactive setup from an extension

**V** An extension can do everything a first-run setup needs:
- list the models that have credentials (`ctx.modelRegistry.getAvailable()`), with `cost`, `contextWindow` and `reasoning` for each (`pi-ai/dist/types.d.ts`)
- prompt with `ctx.ui.select` or `ctx.ui.input`, guarded by `ctx.hasUI`
- persist the choice to its own JSON file under `getAgentDir()` (pattern from `PI/ex/preset.ts`)
- register a re-run command (`pi.registerCommand`)
- probe readiness with `pi.exec("pi", ["auth","check",...])`

**V** `pi update --models` refreshes the model catalog.

**I** In print and JSON mode, children have no UI, so the tier config must already exist before the supervisor dispatches anyone.

**V** The local catalog (`pi-ai/dist/providers/data/*.json`) holds models at several capability and price points for each common credential route (Anthropic, OpenAI, Copilot, OpenRouter, Google), enough to fill four configurable tiers. The steps are not always distinct in price: OpenAI `gpt-6-sol` and `gpt-6.1-sol` both cost 2/10 per M tokens.

## Q5. Feature mapping

**Legend:** "OK" means pi or a package carries the feature directly. "Build" means an extension has to implement it. "Gap" means there is no equivalent.

| claude-supervisor capability (source) | pi mechanism | Status, risk |
|---|---|---|
| Supervisor as main thread (`settings.agent`, `CS/deploy:631-667`) | Extension `before_agent_start` replaces the system prompt; `pi.setActiveTools` drops `bash` | Build. **I** No `agent` setting exists, so the plugin decides when the supervisor persona is on (always, a flag via `registerFlag`, or a command) |
| Supervisor tool deny (Bash, NotebookEdit) | `setActiveTools` or `--exclude-tools`, plus a `tool_call` block | OK |
| `Agent(subagent_type, model)` dispatch (`lead-loop` §2) | A custom `subagent`-style tool (the example) or pi-subagents | Build or adopt. Claude-specific wording in prompts must change |
| 15 agent definitions with frontmatter | Agent `.md` files shipped in the package | The route matters. pi-subagents: OK, through package agent manifests and `excludeTools`, with a frontmatter translation (`disallowedTools` to `excludeTools`; tool names lowercased). Bundled example: Build. It discovers only user and project agent dirs (`PI/ex/subagent/agents.ts:128-133`), reads only name, description, tools and model (`agents.ts:34-39`), and forwards only an allowlist (`index.ts:389-396`). It needs package-agent discovery and denylist support |
| Child context: repository instructions and skill catalog | pi children load context files and skills by default (example). pi-subagents custom agents exclude both unless `inheritProjectContext` / `inheritSkills` is set | pi-subagents: set the inherit options explicitly. Separate from preloading |
| Per-agent tier `model:` | Tier alias resolved to `provider/id` before `--model`, or virtual models | Build (the alias layer). A model name cannot be hard-coded per agent |
| Per-dispatch model override (planner fable, executor opus) | Tool parameter, then `--model` | Build (pi-subagents has it) |
| `effort: xhigh` | `--thinking xhigh` or `model:xhigh`; pi clamps to what the model supports | OK. Meaning varies by provider |
| Per-agent tool allow and deny lists | `--tools` / `--exclude-tools`, SDK `tools` / `excludeTools`, pi-subagents `tools` / `excludeTools` | OK. The example and pi-subagents docs warn that tool policy is not a sandbox |
| Tool names Read, Edit, Write, Glob, Grep, Bash | `read`, `edit`, `write`, `find`, `grep`, `ls`, `bash` | OK, rename. NotebookEdit has no equivalent (unused in practice) |
| WebSearch and WebFetch (researcher-worker, scout) | None built in. Extra packages: `pi-web-access`, the `brave-search` skill | **Gap in core**. Needs a third-party package and probably its own API key |
| Skills (17) | pi skills (Agent Skills spec), shipped in the package | OK. Bodies need edits for Claude-specific tool and agent names |
| Skill preloading via `skills:` | Inject the full SKILL.md body into the child's system prompt | Build. No pi mechanism (SDK inline skills, `--skill`, pi-subagents `skills`) injects bodies; all are metadata with reading on demand. Main-session skills are progressive disclosure only |
| `user-invocable: false`, `context: fork`, `argument-hint` (skills) | No equivalent keys. `disable-model-invocation` exists | Gap (minor). `context: fork` would have to become a subagent dispatch |
| `${CLAUDE_SKILL_DIR}`, `$ARGUMENTS` in skills | Not documented for skills. pi gives the skill path in the prompt, and `/skill:name args` appends the arguments | **U** Gap. Rewrite to paths relative to the skill |
| Slash skills (`/close-out`, `/pick-up`, `/supervisor-config`, `/project-backup`) | `/skill:name`, prompt templates, or `pi.registerCommand` | OK. The command names change (`/skill:` prefix) unless a command or template wraps them |
| AskUserQuestion (supervisor-config) | `ctx.ui.select` / `confirm` in a command handler | OK, but only in the main session |
| Subagents cannot ask the user | Children in print mode have `hasUI` false | Same behaviour |
| Lead loop: parallel workers, then critic, then scope-critic, 3 rounds | Prompt protocol (the skill) plus parallel dispatch | OK once dispatch exists. The example caps 4 running at once and 8 per call; the protocol allows up to 6 units |
| Nesting depth 2 (supervisor, lead, worker) | pi-subagents `maxSubagentDepth` (default 2) and `allowedAgents` | Build or adopt. The example has no guard. **U** Depth counting in pi-subagents is unchecked against the 3-level topology |
| Dispatch allowlist per lead (prompt-only today) | pi-subagents `allowedAgents` can enforce it | OK with pi-subagents (enforced, not prompt-only); prompt-only otherwise |
| Report contract and bounded hand-back | Child's final assistant text (the example caps it at 50 KB) or pi-subagents `outputSchema` | OK |
| Memory store `.supervisor/` | Plain files plus git | OK, harness-neutral |
| External store link via `CLAUDE.local.md` | Not loaded by pi | Gap. The link file needs a pi-visible home (for example AGENTS.md, or the plugin's own config) |
| Executor worktrees at `.claude/worktrees/<slug>` | `git worktree` plus `cwd`; pi-subagents `worktree: true` | OK. Path naming is a choice |
| Commit attribution (settings `attribution`, harness reminders) | No pi equivalent. Only the git-safety skill text | Gap. The trailer lives only in the prompt, and the harness does not inject it |
| `permissions.allow` (codex-critic rule, memory edits) | Not needed, because pi does not prompt | No prompt friction, but there is also **no approval gate** for any agent's bash. Risk. Optional `tool_call` gate (permission-gate example) |
| `permissions.additionalDirectories` (memory root) | pi has no directory sandbox | N/A |
| codex-critic review backend | Same script, run via bash. pi can also run critic on an OpenAI-tier model directly | OK. **I** Partly redundant when tiers already include GPT models. The user decides whether to keep it |
| Four tiers via `ANTHROPIC_DEFAULT_<TIER>_MODEL`, `--fable-is-opus` | Plugin config (tier to `provider/id`), first-run `ui.select` over `getAvailable()`, a re-run command | Build. Easy setup is feasible (see Q4) |
| Provider profiles (OpenRouter, Argo, ...) | pi providers, `models.json`, `registerProvider` | OK, mostly native |
| Installer `deploy` (copy, manifest, reconcile, launcher, update, uninstall, doctor) | `pi install npm:/git:`, `pi update`, `pi remove`, `pi config`; profiles via `PI_CODING_AGENT_DIR` | Mostly native. The manifest and reconcile are not needed, since resources load in place. User overrides happen by shadowing (user agents rank above package agents in pi-subagents). `doctor` becomes a command |
| `doctor` environment checks (spawn depth, model force) | Not applicable; a new check list (pi version, tier readiness via `pi auth check`, web package present) | Build |
| Lint tests (`test_pack_lint.py`) | Re-target to the new frontmatter | Build |
| Live routing test (`claude -p --agent supervisor`) | `pi -p --mode json` with the plugin loaded | Build |
| Transcript audit (`tools/audit`) | pi session JSONL (`PI/docs/session-format.md`), a different format | Build or drop |
| Claude Code background agents and notifications (used by the harness, not referenced by the pack) | pi-subagents background mode | Not required for parity |

## Risks

- **Prompt and model portability (I):** the pack's prompts were tuned for Claude tiers. Routing quality and the critic's verdict format may break on other model families. codex-critic's strict `VERDICT:` validation shows how fragile structured output is. The live routing test is the obvious check.
- **Dependency risk:** reusing `pi-subagents` gains depth caps, allowlists, background runs and resume. The cost is a fast-moving third-party 0.x dependency with its own built-in agents and name collisions (`scout`, `researcher`). Building on the bundled example avoids the dependency but needs the Build items in Q5.
- **Project trust:** with a per-project install (`-l`), children load the plugin only if one of the trust sources in Q2 holds.

## Open questions for the user

1. Should the plugin build on `pi-subagents` (pinned), or be self-contained on pi's bundled subagent example or the SDK?
2. Which providers and credentials will you use for the four tiers? An OpenAI API key is already ambient in your shell. Anthropic is not configured. Note the per-token billing for Claude subscriptions.
3. Should the supervisor persona always be on when pi starts, or only through a flag or command, for example `pi --supervisor` or a separate launcher with `PI_CODING_AGENT_DIR`?
4. Web research needs a third-party package (pi-web-access, or the brave-search skill with a key). Is that acceptable, and which one?
5. Should the codex-critic backend be kept, given that pi can put the critic on a GPT tier directly?
6. Should there be an approval gate for bash in children (a `tool_call` hook), or should pi's no-approval default be accepted?
7. How literal must parity be for slash names, for example `/close-out` versus `/skill:close-out`?

## Coverage gaps

- No child pi run was executed end to end. That needs credentials and token spend, and the user's OpenAI key was deliberately not used.
- `pi-subagents` was read from its README and `docs/agents.md` only, not from source. Its depth counting is **U**.
- pi's handling of unknown skill frontmatter keys and of `${CLAUDE_SKILL_DIR}` was not tested.
- `SettingsManager` writes from inside an extension, and routing a virtual model to a child, were not tested.
- The CS reference files (`conflict-resolution.md`, `landing-from-worktree.md`, `external-store.md`, `writing.md`) and the full `deploy` source were skimmed, not read in full.
- Other community packages (`pi-lite-subagent`, `@pi-archimedes/subagent`, `@mystilleef/pi-subagent`) were only listed.
