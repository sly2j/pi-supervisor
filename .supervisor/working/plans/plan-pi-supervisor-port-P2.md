# Plan P2: setup, persona and commands

Child plan of `plan-pi-supervisor-port.md`, package P2 (Deps: P1, done). Pointers are taken
against commit `a44eefe` of this repo (P3 and P4 landed) and pi 1.5.2. Abbreviations as in the parent: `PI/` is the
pi-coding-agent install directory, `CS/` the read-only source. `T` = `PI/dist/core/extensions/types.d.ts`.

## Goal

Make `pi-supervisor` usable from the first start: a tier wizard behind `/supervisor-config`
(with `status` and `doctor`), the supervisor persona in the main session with `/supervisor
off|on`, and the literal commands `/close-out`, `/pick-up`, `/project-backup`,
`/meeting-summary` and `/supervisor-memory`. All tests are token-free.

Non-goals: agent and skill text (P3, P4); `docs/setup.md` (P7); live model runs; a non-TUI
wizard. The source has no tier wizard: its `supervisor-config` skill only switched the codex
critic (`CS/pack/skills/supervisor-config/SKILL.md:12-16`), so the wizard is new.

Expected change size: about 1,350 lines, plus 9 changed lines of P2-D14. Extension code 650 (`setup.ts` 230, `persona.ts`
120, `doctor.ts` 130, `commands.ts` 130, `index.ts` +40); tests 550; fixtures 150.

## Approach

Four modules wired by `index.ts`, each split into host-free functions (unit-tested with
`node --test`) and a thin handler that takes pi's `ctx`. Behaviour that only pi can show (model
switch, active tools, commands, UI prompts) is tested end to end with the scripted provider:
print mode where no UI is needed, and a new RPC driver (`--mode rpc`) that answers
`extension_ui_request` messages for the wizard and the commands (`PI/docs/rpc-extension-ui.md`).

Rejected alternatives:
- Testing the wizard only through unit tests with a fake `ctx`: it would not show that
  `setModel`, `setActiveTools` and `ctx.reload()` behave as assumed; RPC runs the real host.
- Running the wizard from `session_start` on first start: `ctx.reload()` exists only on the
  command context (`T:342`), and the web package needs a reload. The first start prefills
  the editor with `/supervisor-config` instead.
- An environment variable that swaps the web package source for tests: a test hook in product
  code. The install step takes the source as an argument; the test passes a local package.

## Decisions

- P2-D1 First start. In the main session, with `ctx.hasUI` and no config file, `session_start`
  (reason `startup`) calls `ctx.ui.notify("Supervisor for Pi is not set up yet. Press Enter
  to choose its models.", "info")` and `ctx.ui.setEditorText("/supervisor-config")` (`T:155`).
  One Enter starts the wizard. Without a UI it only sets the status (P2-D9).
- P2-D2 Wizard (`/supervisor-config` with no argument), in order. Any cancel (`select` returning
  `undefined`, or Escape on a `confirm`) stops with "Setup cancelled; nothing was changed."
  1. Models: `ctx.modelRegistry.getAvailable()`. If empty, notify (error) "No models with
     credentials. Log in with /login (for example a ChatGPT or Claude subscription) or set a
     provider key such as OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY, restart
     pi-supervisor, then run /supervisor-config again." and stop, writing nothing.
  2. Proposal: the existing config if valid, else `proposeTiers` (P2-D3). One `select` shows it
     in the title, a line per tier with its role and price (`top   openai-codex/gpt-6.1-sol
     $2/$10 per M  planner, supervisor`; roles from the parent's tier table), plus "Only K
     distinct models; some tiers share one." when K < 4. A configured tier whose model is not
     in `getAvailable()` shows "(no credentials)" in place of its price; Accept keeps it, and
     the doctor in step 6 then fails on it. Options: `Accept`, `Change top`,
     `Change strong`, `Change standard`, `Change fast`, `Use another provider` (when two or
     more providers have models), `Cancel`. A change opens a `select` over every available
     model, most expensive first, then returns to the proposal.
  3. Critic: only with two or more providers. `confirm("Critic model", "Review with a model
     from another provider than the top tier? A second model family catches different
     mistakes.")`, default no. Yes opens a `select` over `criticChoices` (P2-D4).
  4. Web tools: only when `web_search` is not in `pi.getAllTools()`. `confirm("Web tools",
     "Install pi-web-access for web_search and fetch_content? It goes into the pi-supervisor
     profile only.")`. Yes runs `installWeb` (P2-D6); a failure is a warning and setup goes on.
  5. Notice: when any chosen model has provider `anthropic` and
     `ctx.modelRegistry.isUsingOAuth(model)`, notify pi's per-token billing notice
     (`PI/dist/modes/interactive/interactive-mode.js:165`; parent Risks).
  6. Write the config (P2-D5), run the doctor (P2-D8) and notify its report, notify
     "Supervisor is on. Top tier: <model>.", then `await ctx.reload(); return;`. The reload is
     last because it invalidates `ctx` and `pi` (`PI/docs/extensions.md:1528-1536`); its
     `session_start` (reason `reload`) turns the persona on.
  Without a UI, `/supervisor-config` reports "The setup wizard needs the interactive TUI;
  write <path> by hand (see /supervisor-config status)."
- P2-D3 `proposeTiers(models, preferProvider?)`: pick the provider of the session model if it
  has available models, else the provider with the most, ties by name. Sort its models by
  `cost.output`, then `cost.input`, descending, then id. Tier i of 0..3 gets index
  `round(i * (n - 1) / 3)`: 5 models give 0, 1, 3, 4; 2 give 0, 0, 1, 1; 1 gives all four the
  same. `Use another provider` re-runs it with the chosen provider. Prices are present on
  `openai-codex` (P1 fact), so the parent's `openai` price fallback is not built.
- P2-D4 `criticChoices(models, topProvider)`: available models of other providers, sorted as
  in P2-D3; the first is the default highlight. `critic` stays `null` on no.
- P2-D5 Config write: `writeConfig(agentDir, config)` writes `pi-supervisor.json` through a
  temporary file and rename, then re-reads it with `loadConfig` (`tiers.ts:12`) so a written
  file is always valid. The wizard adds no thinking suffix; suffixes in an existing config
  are kept.
- P2-D6 `installWeb(exec, source = "npm:pi-web-access")` runs pi's own binary as dispatch does
  (`index.ts:15-19`) with `["install", source]` through `pi.exec`, which inherits
  `PI_CODING_AGENT_DIR` from the launcher, so the package lands in the profile only (D13).
  Returns `{ok, output}`; output is the stdout/stderr tail.
- P2-D7 Persona. Applies in the main session only (`PI_SUPERVISOR_AGENT` unset), when the
  config is valid, `agents/supervisor.md` parses, and the `top` model is found by
  `ctx.modelRegistry.find(provider, id)` and has auth (`hasConfiguredAuth`). Otherwise it
  stays off and the status says why (P2-D9). On `session_start` (any reason; it re-fires on
  reload, new, resume, fork) it is idempotent:
  - the original model ref, thinking level and active tools come from the latest
    `pi-supervisor-persona` entry when it holds them; otherwise the current ones are saved
    into a new entry before the switch. A fresh runtime (reload, resume) thus never saves the
    already-switched model as the original (extension state does not survive a reload,
    `PI/docs/extensions.md:1529-1534`). A new session saves whatever it starts on;
  - `pi.setModel(top)`; a tier suffix sets `pi.setThinkingLevel`; `false` from `setModel`
    means off with a status;
  - `pi.setActiveTools(personaTools(def, all))`: the `tools` list of `agents/supervisor.md`
    filtered to registered names, which drops `bash` as the source did
    (`CS/pack/agents/supervisor.md:1-7`);
  - `before_agent_start` returns `{systemPrompt: event.systemPrompt + "\n\n" + body}` with
    the body of `agents/supervisor.md` (`T:1145`), only while on.
  `/supervisor off` restores the saved model, thinking level and tools, stops appending, and
  writes `{on: false}` without an original, so the next apply saves afresh;
  `/supervisor on` re-applies; `/supervisor` alone shows the state. The state is stored
  with `pi.appendEntry("pi-supervisor-persona", {on, original?})` and read back on `session_start`, as
  `PI/examples/extensions/preset.ts:415-435` does, so `/reload` and `/resume` keep it and a new
  session starts on.
- P2-D8 Doctor (`/supervisor-config doctor`; also step 6 of the wizard). `runChecks(deps)`
  returns `{level: "PASS" | "WARN" | "FAIL", name, detail}[]`, printed one per line, then
  "N FAIL, M WARN", as `CS/deploy:1997`. Checks:
  - FAIL: pi older than 1.5.2 (`VERSION` from pi's exports, `PI/dist/index.d.ts:2`); Node older
    than 22.19; config missing or invalid (detail names `/supervisor-config`); a tier or the
    critic whose model is not in the registry, or has no credentials, detail
    "tier fast: anthropic/claude-haiku-4-5 has no credentials; /login, set the provider key,
    or remap it with /supervisor-config"; `agents/` fails to load or lacks `supervisor.md`.
  - WARN: `web_search` or `fetch_content` missing (detail: "installed; active after /reload"
    when the profile `settings.json` lists `npm:pi-web-access`, else "run /supervisor-config");
    `python3`, `git` or `zip` not on `PATH`.
  Tier readiness uses the session's model registry, not `pi auth check` as the parent's step
  7 says: the registry also knows providers registered by extensions and `models.json`.
- P2-D9 Status line, key `pi-supervisor` (`ctx.ui.setStatus`): `supervisor on · top
  <model>`, `supervisor off (/supervisor on)`, `supervisor: not set up (/supervisor-config)`,
  or `supervisor: <reason> (/supervisor-config doctor)` for an invalid config, a missing
  `supervisor.md` or an unusable `top`. A non-top tier without credentials adds
  `· <tier> has no credentials` and leaves the persona on; dispatch to that tier then fails
  with the P1 error entry.
- P2-D10 `/supervisor-config status` shows the config path, the four tiers with roles, the
  critic, the persona state and the web tools state. It needs no UI.
- P2-D11 Output of commands goes through one `show(ctx, text, level)`: `ctx.ui.notify` with a
  UI, else stderr (stdout carries JSON in json mode).
- P2-D12 Literal commands, registered only in the main session (D11, `CS` frontmatter per
  skill):
  - `/close-out [retry]` and `/pick-up [<plan path> | <card>...]`: `pi.sendUserMessage(block +
    "\n\n" + args)`, `block` from `loadSkillBlock(ROOT/skills, name)` (`agents.ts:57`). The
    turn starts at once (`T:1312`). A missing skill is an error naming the path.
  - `/project-backup`: `pi.exec("sh", [ROOT/skills/project-backup/scripts/backup.sh], {cwd})`
    with `cwd` the git top level of `ctx.cwd` (else `ctx.cwd`), because `backup.sh` uses
    `pwd` as the project root (`CS/pack/skills/project-backup/scripts/backup.sh:19`); shows
    the output, error level on a non-zero exit. `PROJECT_BACKUP_DIR` passes through.
  - `/meeting-summary <transcript path> [notes]`: one `writer-worker` child through
    `runTasks` (`dispatch.ts:220`) with the agent's own skills plus `meeting-summary`, so the
    skill sits in the child's system prompt and the arguments are the task. Replaces
    `context: fork`. The result is posted with `pi.sendMessage({customType:
    "pi-supervisor-result", content, display: true})` without a turn, so the user sees it and
    the supervisor can use it. A child error is shown at error level.
  - `/supervisor-memory <externalize|link|status> [options]`: `pi.exec("python3",
    [ROOT/skills/project-memory/scripts/memory, ...args], {cwd: ctx.cwd})` and shows the
    output. The script's own hints already name `/supervisor-memory`.
- P2-D13 Ownership. P2 writes the files under `## Outline` only. It edits `index.ts` (P1's,
  done) for wiring and the scripted provider fixture for prices. In `agents/` and `skills/`
  (P3 and P4, landed at `27b69fc` and `a44eefe`) it changes only the `/clear` lines of
  P2-D14. Its tests copy their own stub agents and skills into the sandbox package.
- P2-D14 `/clear` becomes `/new`. pi 1.5.2 has no `/clear`; `/new` ("Start a new session",
  `PI/dist/core/slash-commands.js:22`) is the equivalent, and `/compact` is not (it keeps a
  summary). Edits, wording otherwise unchanged: `skills/close-out/SKILL.md:3,10,26,29`
  ("safe to /new", "not safe to /new"), `skills/pick-up/SKILL.md:3` ("after /new or a
  restart"), `agents/supervisor.md:114-115`. The lints catch a return: `r"/clear\b"` joins
  `SOURCE_ONLY` in `tests/test_skills_lint.py:22` (matched raw, `:145`) and
  `SOURCE_LEFTOVERS` in `tests/test_agents_lint.py:59` (a pattern holding a backslash is
  matched raw, `:195`).

## Outline

`extensions/supervisor/persona.ts` (new):
```ts
type Original = { model?: string; thinking: string; tools: string[] }; // model as provider/id
type PersonaEntry = { on: boolean; original?: Original }; // data of "pi-supervisor-persona"
export function personaTools(def: AgentDef, all: string[]): string[]; // def.tools present in all
export function parseModelRef(ref: string): { provider: string; id: string; thinking?: string };
export function personaState(entries: SessionEntry[]): PersonaEntry; // latest entry, default {on: true}
export function registerPersona(pi: ExtensionAPI, root: string): void; // events + /supervisor
```
- `parseModelRef`: the suffix after the last `:` is thinking only if it is a pi thinking level
  (`off` to `max`); ids such as Bedrock ones contain colons.
- Host imports are type-only; `registerPersona` gets `getAgentDir` and `parseFrontmatter` from
  `index.ts` (pattern `index.ts:46`).

`extensions/supervisor/doctor.ts` (new):
```ts
type Check = { level: "PASS" | "WARN" | "FAIL"; name: string; detail: string };
type DoctorDeps = { piVersion: string; nodeVersion: string; agentDir: string; root: string;
  find(p: string, id: string): Model<Api> | undefined; hasAuth(m: Model<Api>): boolean;
  tools: string[]; onPath(cmd: string): boolean; parse: Parse };
export function runChecks(d: DoctorDeps): Check[];
export function formatChecks(c: Check[]): string;
```

`extensions/supervisor/setup.ts` (new):
```ts
type TierMap = Record<Tier, string>;
export function proposeTiers(models: Model<Api>[], preferProvider?: string): TierMap;
export function criticChoices(models: Model<Api>[], topProvider: string): Model<Api>[];
export function describeTiers(t: TierMap, models: Model<Api>[]): string; // roles, prices, shared note
export function writeConfig(agentDir: string, c: Config): void;
export function installWeb(exec: Exec, source?: string): Promise<{ ok: boolean; output: string }>;
export function registerSetup(pi: ExtensionAPI, deps: SetupDeps): void; // /supervisor-config, first start
```

`extensions/supervisor/commands.ts` (new): `registerCommands(pi, {root, runTasks deps})`;
`gitTop(exec, cwd)`; `show(ctx, text, level)` (shared with setup and persona).

`extensions/supervisor/index.ts` (edit): keep the dispatch tool; when `PI_SUPERVISOR_AGENT` is
unset call `registerPersona`, `registerSetup` and `registerCommands`; export `invocation` for
`installWeb`. A child registers nothing new (parent invariant).

Tests and fixtures (new unless marked):
- `tests/fixtures/rpc.ts`: `class Rpc { constructor(box, args); send(cmd); request(cmd):
  Promise<response>; answer(match, reply); events; close() }`. Spawns `pi --mode rpc` with the
  sandbox env and stdin as a pipe (RPC reads stdin; the P1 hang applies to `-p` only), and
  answers each `extension_ui_request` from a queue of `{method, title regex, value |
  confirmed | cancelled}`; an unexpected request fails the test.
- `tests/fixtures/p2/`: overlay copied into `box.pkg` by the tests: `agents/supervisor.md`
  (`SUPERVISOR-BODY-MARKER`, the same `tools` list as the real one), `agents/writer-worker.md` (tier standard), skills `close-out`,
  `pick-up`, `meeting-summary` (marker bodies, no braces), `project-backup/scripts/backup.sh`
  (prints `=== BACKUP REPORT ===` and `pwd`; exits with `$STUB_EXIT`), and `web-stub/` (a pi
  package with one tool `web_search`). `memory_command` also copies the repo's real
  `skills/project-memory/scripts/memory` (P5, read-only to P2) into `box.pkg`.
- `tests/fixtures/scripted-provider/index.ts` (edit): prices on the four models, `top`
  highest, so the wizard proposal is `scripted/top`..`scripted/fast`; P1 tests ignore prices.
  It also registers a test-only `/test-reload` command that calls `await ctx.reload()`
  (pattern `PI/examples/extensions/reload-runtime.ts`), because built-in `/reload` does not run
  through an RPC `prompt` (`PI/docs/rpc-commands.md:834`). Nothing goes into product code.
- `tests/fixtures/harness.ts` (edit): `start` and `run` take an optional model, default
  `scripted/top` (`harness.ts:56`).
- `tests/node/{persona,doctor,setup,commands,skills.real}.test.ts`.

Gotcha: the scripted provider parses from the first `{` of the last user message, so fixture
skill bodies hold no braces.

## Slices

1. Persona and `/supervisor`: a valid config turns the main session into the supervisor.
   - Units: `persona.ts` + `index.ts` wiring + `tests/node/persona.test.ts`; `tests/fixtures/rpc.ts`
     + `tests/fixtures/p2/agents/` + the `harness.ts` model argument + `/test-reload`.
   - Tests:
     - `persona_tools: supervisor tools list, registered [read,bash,edit,write,grep,find,ls,dispatch]
       -> [read,edit,write,grep,find,ls,dispatch]`
     - `parse_model_ref: "amazon-bedrock/a.b:v1:0" -> id kept whole; "openai/x:high" -> thinking high`
     - `persona_on: config, print mode, --model scripted/strong, {echoSystem} -> reply model
       scripted/top, text contains SUPERVISOR-BODY-MARKER; {echoTools} -> no bash, has dispatch, grep`
     - `persona_off: rpc, /supervisor off -> get_state model scripted/strong; {echoTools} has bash;
       {echoSystem} lacks the marker`
     - `persona_off_survives_reload: rpc, /supervisor off, /test-reload -> model still scripted/strong`
     - `persona_on_reload_then_off: rpc started on scripted/strong, /test-reload while on,
       /supervisor off -> model scripted/strong, bash active`
     - `persona_absent_in_child: dispatch stub-worker {echoSystem} -> no marker; tools unchanged`
     - `no_config: no file, rpc -> setStatus "not set up", model unchanged, bash active`
     - `invalid_config: version 2 -> persona off, status names the file`
     - `top_no_credentials: top anthropic/claude-haiku-4-5 -> persona off, status names doctor`
   - Checkpoint: `node --test` from the worktree root passes.
2. Doctor and `/supervisor-config status|doctor`: a user can see whether setup is sound.
   - Units: `doctor.ts` + `tests/node/doctor.test.ts`; the `status`/`doctor` branch of
     `setup.ts` + its RPC tests in `tests/node/setup.test.ts`.
   - Tests:
     - `doctor_all_pass: fake deps, all ready -> no FAIL; summary "0 FAIL, 0 WARN"`
     - `doctor_tier_not_ready: fast on anthropic, no key (rpc) -> FAIL line names tier fast and /login`
     - `doctor_missing_config -> FAIL naming /supervisor-config`
     - `doctor_web_pending: settings lists npm:pi-web-access, tool absent -> WARN "active after /reload"`
     - `status_command: rpc -> notify lists four tiers with roles, critic none, persona on`
   - Checkpoint: `node --test` passes.
3. Wizard and first start: from no config to a working persona in one command.
   - Units: the wizard part of `setup.ts` + `tests/node/setup.test.ts`; scripted provider
     prices; `tests/fixtures/p2/web-stub/`.
   - Tests:
     - `propose_four: 5 priced models of one provider -> 4 distinct tiers, highest price on top`
     - `propose_two: 2 models -> top = strong = dearer, standard = fast = cheaper`
     - `propose_prefers_current: two providers, session on the smaller -> its models`
     - `critic_choices: two providers -> only the other provider's models, dearest first`
     - `no_models: rpc, no provider with credentials -> error notify with /login hint, no file`
     - `wizard_writes_config: rpc, Accept, critic no, web no -> file tiers scripted/top..fast,
       critic null; after reload get_state model scripted/top`
     - `wizard_change_tier: Change fast -> pick scripted/standard -> file fast scripted/standard`
     - `wizard_cancel: cancel at the proposal -> no file, "nothing was changed"`
     - `wizard_rerun_uses_config: existing config, fast on anthropic without a key -> proposal
       shows its tiers, fast marked "(no credentials)"`
     - `web_install_profile_only: installWeb(real exec, web-stub dir) under the sandbox env ->
       profile settings.json lists it; fake default dir checksum unchanged`
     - `first_run_offer: rpc start without config -> set_editor_text "/supervisor-config"`
   - Checkpoint: `node --test` passes.
4. Literal commands.
   - Units: `commands.ts` + `tests/node/commands.test.ts`; `tests/fixtures/p2/skills/`.
   - Tests:
     - `close_out_command: rpc "/close-out retry" + {echoUser} in args -> reply holds the
       close-out marker and "retry"`
     - `pick_up_command: same for pick-up with a plan path`
     - `project_backup_command: rpc in a git repo, from a subdirectory -> notify holds the
       report block and the repo top level`
     - `project_backup_failure: STUB_EXIT=1 -> error-level notify`
     - `meeting_summary_command: args {echoSystem} -> custom message holds the meeting-summary
       marker; child agent writer-worker`
     - `memory_command: rpc "/supervisor-memory status" in a git repo without a store -> output
       of the script shown`
     - `commands_absent_in_child: print mode with PI_SUPERVISOR_AGENT=x, prompt "/close-out
       {echoUser}" -> reply is the raw text, no close-out marker`
     - `skills_load_clean: sandbox package with the real skills/ copied in, print mode {say: "ok"}
       -> reply "ok", stderr has no line mentioning a skill` (`tests/node/skills.real.test.ts`;
       the check P4's checkpoint names)
     - `no_clear_left: python3 -m pytest -q tests/test_skills_lint.py tests/test_agents_lint.py
       -> passes with /clear in both leftover lists, and r"/clear\b" matches "safe to /clear,"`
   - Second unit: the P2-D14 `/clear` edits in `skills/close-out/SKILL.md`,
     `skills/pick-up/SKILL.md`, `agents/supervisor.md` and the two lint lists.
   - Checkpoint: `node --test` passes; `python3 -m pytest -q` still passes.

## Verification

In the P2 worktree: `node --test` and `python3 -m pytest -q` pass. Then a manual TUI run under
a temporary profile and prefix (`./install --profile <tmp> --prefix <tmp>`, linked logins) on
the user's `openai-codex` login: start `<tmp>/bin/pi-supervisor`, press Enter on the prefilled
`/supervisor-config`, accept, critic no, install web tools yes; the doctor shows no FAIL and
the status line shows `supervisor on`; one small request (a typo fix in a scratch repo) is
routed to `fixer` and its child session appears under the D15 directory. Uninstall the
temporary profile afterwards (`residue`).

## Risks

- RPC startup without any model (the `no_models` case) is unverified; if pi refuses to start,
  that test runs in print mode against `runWizard` with a fake `ctx`.
- `setModel` and `setActiveTools` inside `session_start` are inferred, not run; slice 1 tests it
  first. Fallback: apply on the first `before_agent_start`.
- `node --test` from the main checkout also finds test files in `.claude/worktrees/` and
  `.pi/worktrees/`; run checkpoints from the P2 worktree root.
- `pi install npm:pi-web-access` needs network and npm; only the manual run covers it.
- A user who changes model with `/model` while the persona is on keeps that model; `/supervisor
  off` still restores the model saved at start.

## Scope Notes

- In scope: the files in `## Outline` and the P2-D14 lines. Out of scope: other content of
  `agents/` and `skills/` (P3, P4, landed), docs (P7), routing tests (P6), parent decisions.
- Not to reopen: dedicated launcher and profile (D20); generic tier names (D6); self-contained
  dispatch; `pi-web-access` (D13); optional critic model replacing codex-critic (D9); product
  name and trailer (D22); persona on by default in the profile with a command to switch it off
  (D10); literal command names (D11).
- Memory: `.supervisor/memory/` holds no entries.
- Amend parent (for `fixer`; P2 executes against these, the parent decisions stand otherwise):
  1. Setup step 7: write the config, run the doctor, then reload (P2-D2.6); reload is terminal.
  2. Setup step 7 and D8 check list: tier readiness from the session's model registry, not
     `pi auth check` (P2-D8).
  3. D10: the prompt is appended by returning `{systemPrompt}` from `before_agent_start`
     (`T:1145`), the typed result, not by mutating `appendSystemPrompt`.
  4. D10: the persona sets the `tools` list of `agents/supervisor.md` instead of only removing
     `bash` (P2-D7).
  5. Risks, last item: the `openai` price fallback is not built; `openai-codex` has prices (P1).
  6. P2 Owns adds: `extensions/supervisor/index.ts` (wiring), `tests/fixtures/rpc.ts`,
     `tests/fixtures/p2/`, edits to `tests/fixtures/harness.ts` and
     `tests/fixtures/scripted-provider/index.ts`, `tests/node/skills.real.test.ts`, and the
     P2-D14 lines in `skills/close-out/SKILL.md`, `skills/pick-up/SKILL.md`,
     `agents/supervisor.md`, `tests/test_skills_lint.py`, `tests/test_agents_lint.py`.

## Assumptions

- `ctx.ui.setEditorText` reaches RPC as `set_editor_text`: checked by `first_run_offer`.
- `pi.sendUserMessage` from a command starts a turn in RPC: checked by `close_out_command`.
- The faux provider counts as having credentials for `getAvailable`: checked by `wizard_writes_config`.
- `VERSION` is exported by pi 1.5.2 (`PI/dist/index.d.ts:2`): checked by `doctor_tier_not_ready`, which runs the real doctor over RPC.

## Open Questions

None for the user. Amendments to the parent: `## Scope Notes`, "Amend parent".

## Log

## Todo

- [ ] S1: `persona.ts`, `index.ts` wiring, `tests/fixtures/rpc.ts`, overlay agents; persona tests pass
- [ ] S2: `doctor.ts`, `/supervisor-config status|doctor`; doctor tests pass
- [ ] S3: wizard, first-start offer, `installWeb`, scripted prices, web stub; setup tests pass
- [ ] S4: `commands.ts`, overlay skills and stub `backup.sh`; command tests pass
- [ ] S4: `/clear` to `/new` (P2-D14) in the three files and both lint lists; `skills_load_clean`
- [ ] Verification: manual TUI run under a temporary profile; uninstall it
