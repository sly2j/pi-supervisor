# Parity record

## 1. Verdict

**Pass** (2026-11-15; owner checklist passed 2026-11-17). Stages A to E are run: the cross
lint passes, routing scores 28 of 28 after one tuning round, `e2e_mode1` (re-run) and
`e2e_mode2` pass, and the agent TUI run passes steps 1 to 7 (section 4). No rule below holds
1.0.0 on these results.

Sign-off rules (P6-D15, parity bar D24: 24 of 28 routing cases to sign off, 28 as target):

| Part fails | Meaning | 1.0.0 |
|---|---|---|
| Cross lint | a pack defect; fixed if agent or skill text, else a follow-up | held until it passes |
| Routing below 24 of 28 after tuning | below the bar; reported with the failing cases | held; the owner decides |
| Routing 24 to 27 | passes the bar; each failure listed with a follow-up | not held |
| `e2e_mode1` or `e2e_mode2` | a defect or a judgement failure; a re-run needs a new spend approval | held until both pass |
| Agent TUI steps 1-7 | a bug in P2's code | held |
| Owner checklist | rendering or wording alone are follow-ups | held only for a functional failure |
| A row below without evidence or reason | incomplete record | held |

## 2. Capability rows

One row per row of the research mapping table (Q5), plus the `--global` row of the port plan's parity map.
Test names are in `tests/node/*.test.ts` or the Python files named.

| Source capability | Disposition | How | Evidence |
|---|---|---|---|
| Supervisor as main thread | adapted | D10: `before_agent_start` swaps the persona in, only in the launcher's profile (D20) | `persona_on`, `persona_off`, `persona_off_survives_reload` (node); section 4 run E |
| Supervisor tool deny | adapted | D10: `bash` dropped from the active tools; NotebookEdit has no pi equivalent | `persona_tools`; `agents_lint` tool table |
| `Agent` dispatch | adapted | D2, D3: the `dispatch` tool starts child pi processes | `child_text`, `nested`, `parallel`, `live_nested`; section 4 `e2e_mode1` |
| 15 agent definitions | adapted | D12: frontmatter and tool names translated; one file per agent | `test_agents_lint.py`; `preloads_match_source` |
| Child context (repo instructions, skill catalog) | carried | D3: system prompt appended, not replaced | `child_sees_prompt` |
| Per-agent tier | adapted | D6, D7: tier name resolved to `provider/id` from the profile config | `resolve_default`, `resolve_override`; section 4 child models |
| Per-dispatch model override | carried | `model` in `tasks[]`, a tier name | `resolve_override`; routing cases 16-19, 22, 24-26 |
| `effort: xhigh` | adapted | D8: `--thinking xhigh` | `args_thinking`; section 4 `e2e_mode2` thinking entry |
| Per-agent tool lists | carried | `--tools` and `--exclude-tools` per agent | `args_allowlist`, `args_denylist`, `leaf_has_no_dispatch` |
| Tool names | adapted | D12: Read, Edit, Write, Glob, Grep, Bash become pi names | `test_agents_lint.py` (pi tool names only); `test_skills_lint.py` |
| WebSearch, WebFetch | adapted | D13: third-party `pi-web-access`, offered by the wizard | `web_install_profile_only`, `doctor_web_pending`; section 4 step 4 |
| 17 skills | carried | 16 as skills, one (`supervisor-config`) as a command (D11) | `test_skills_lint.py`; `skills_load_clean` |
| Skill preloading | adapted | D5: skill bodies injected into the child's system prompt | `args_skills`, `skill block equals pi's own /skill:name expansion` |
| `user-invocable`, `context: fork`, `argument-hint` | dropped | pi has no such keys; fork is a dispatch (D11) | reason: no pi equivalent; lint rejects the keys |
| `${CLAUDE_SKILL_DIR}`, `$ARGUMENTS` | adapted | D12: paths relative to the skill; arguments follow the command | `test_skills_lint.py` source-leftover check |
| Slash skills | carried | literal command names (D11): `/close-out`, `/pick-up`, `/project-backup`, `/meeting-summary`, `/supervisor-memory` | `close_out_command`, `pick_up_command`, `project_backup_command`, `meeting_summary_command`, `memory_command` |
| AskUserQuestion | adapted | `ctx.ui` select and confirm in the setup commands | `wizard_writes_config`, `wizard_change_tier`; section 4 steps 2-4 |
| Subagents cannot ask the user | carried | children run in print mode with no UI | `commands_absent_in_child`; section 4 evidence |
| Lead loop | carried | protocol skill plus parallel dispatch, concurrency 6 (D2) | `parallel`; section 4 `e2e_mode1` (researcher, worker, critic) |
| Nesting depth 2 | adapted | D4: depth counted through `PI_SUPERVISOR_DEPTH` | `depth_cap`, `nested`; section 4 `e2e_mode1` depth check |
| Dispatch allowlist per lead | carried | prompt text, lint-checked (D4), as in the source | `test_agents_lint.py` dispatch relations; `dispatch_targets_exist` |
| Report contract | carried | child's final assistant text, capped at 50 KB | `child_text`; `nested` |
| `.supervisor/` store | carried | unchanged layout | `test_memory.py`; `e2e_mode1` research file |
| External store link | adapted | D14: link root stays outside the profile, as in the source | `memory_command`; `test_memory.py` |
| Executor worktrees | adapted | `.pi/worktrees/<slug>` in the executor text | `test_skills_lint.py`, `test_agents_lint.py` path checks |
| Commit attribution | adapted | trailer named by D22; skill text only, the harness injects nothing (D19) | `test_skills_lint.py` trailer check; not enforced by code |
| `permissions.allow` | dropped | pi has no permission prompts | reason: no pi equivalent |
| `permissions.additionalDirectories` | dropped | pi has no directory sandbox | reason: not applicable |
| codex-critic backend | dropped | user decision 5; the critic tier model replaces it (D9) | reason: user decision; `critic_choices` |
| Four tiers and `--fable-is-opus` | adapted | D6, D7: four tier names, wizard proposal | `propose_four`, `propose_two`, `wizard_writes_config`; section 4 steps 1-3 |
| Provider profiles | carried | pi providers and `models.json`; documented in the setup docs | reason: native pi; `doctor_tier_not_ready` |
| Installer `deploy`, launcher and separate profile | adapted | D20, D21: `install` script, `pi-supervisor` launcher, own profile; manifest and reconcile dropped | `test_install.py` |
| `--global` install into the default profile | adapted | opt-in `pi install <clone>`, not recommended (D20) | reason: native pi; `test_refuses_default_dir` |
| `doctor` | adapted | `/supervisor-config doctor` | `doctor_all_pass` and the other `doctor_*` tests; section 4 step 5 |
| Lint tests | adapted | `test_agents_lint.py`, `test_skills_lint.py`, `test_pack_cross.py` | the three files |
| Live routing test | adapted | `tests/test_live_routing.py` on `pi --mode json`; D2 case mapping | section 3 |
| Transcript audit | dropped | developer tool tied to Claude Code transcripts; child sessions kept as evidence (D15) | reason: decision; `sessions` test; section 5 |
| Background agents | not required | not referenced by the pack | reason: harness feature, not part of the pack |

## 3. Routing cases

Route `openai-codex` (oauth), main session on `top` = `gpt-6-astra`, tools blocked by the
`live-stop` fixture (no case attempted a tool call). Every case answered in one assistant turn.
Columns: expected and got are `mode / agent / model`; "first run" is stage A (cases 1, 4, 5, 16)
or stage B (the rest); "round 1" is the full re-run after the tuning edit below.

| # | Request (abridged) | Expected | First run | Round 1 |
|---|---|---|---|---|
| 1 | Fix the typo 'recieve' in README.md | 2 / fixer / default | pass | pass |
| 2 | Commit the staged changes with a message | 2 / git-ops / default | pass | pass |
| 3 | Which file defines parse_frontmatter? | 2 / scout / default | pass | pass |
| 4 | Difference between /new and /compact? | direct / none / default | pass | pass |
| 5 | Find out how deploy registers profiles, write it up | 1 / researcher / default | pass | pass |
| 6 | Plan a `--json` flag for `deploy status` | 1 / planner / default | pass | pass |
| 7 | Add a `--json` flag to `deploy status` with tests | 1 / executor / default | pass | pass |
| 8 | Draft the proposal overview from notes | 1 / writer / default | pass | pass |
| 9 | Rename `cfg` to `config` across three files | 2 / fixer / default | pass | pass |
| 10 | Fixer escalated: 12 files, signatures change | 1 / executor / default | pass | pass |
| 11 | Push main to origin | 2 / git-ops / default | pass | pass |
| 12 | Move four functions into a `ProfileRegistry` class | 1 / executor / default | pass | pass |
| 13 | Quick: fix the failing test | 2 / fixer / default | pass | pass |
| 14 | Change the default backup directory; existing users affected | 1 / executor / default | fail: got 2 / fixer / default | pass |
| 15 | Plan retry logic, decorator or loop open | 1 / planner / default | pass | pass |
| 16 | Plan the move of all services to a new auth provider | 1 / planner / top | pass | pass |
| 17 | Shared state between registry and fixture loader, trade-offs | 1 / planner / top | pass | pass |
| 18 | Plan a Windows port, no packaging experience | 1 / planner / top | pass | pass |
| 19 | Plan a `--quiet` flag, be thorough | 1 / planner / top | pass | pass |
| 20 | Work through my annotations in the plan | 1 / planner / default | pass | pass |
| 21 | Sync the plan checklist with git | 1 / planner / default | pass | pass |
| 22 | Short team email: deploy window moves | 1 / writer / strong | pass | pass |
| 23 | Methods paragraph for the paper | 1 / writer / default | pass | pass |
| 24 | Intermittent parallel test failure, find the race | 1 / executor / strong | pass | pass |
| 25 | New agent definition for a security reviewer | 1 / executor / strong | pass | pass |
| 26 | Split deploy into a package, unfamiliar code | 1 / executor / strong | pass | pass |
| 27 | Why is `deploy install` slow? Investigate first | 1 / researcher / default | pass | pass |
| 28 | KeyError crash: fix with a regression test, with review | 1 / executor / default | pass | pass |

Score: 27 of 28 on the first run, 28 of 28 after round 1 (kept; no round 2).

Case 14 failure: the reasoning summary was "Choosing minimal mode", read as the fast tier, while
the rule means a Mode 1 brief with `Path: minimal`. Round 1 edit, `agents/supervisor.md` Routing
Judgment, wording only:
- before: ``- Brief `Path: minimal` when only "cheap to undo" or "no design decision" fails.``
- after: ``- When only "cheap to undo" or "no design decision" fails, use Mode 1 with `Path: minimal`.``

| Stage | Cases | Tokens (input / cache read / output) | Catalog USD | Wall time | Stop |
|---|---|---|---|---|---|
| A, pilot | 4 | 21,741 / 0 / 102 | 0.22 | 36 s | none |
| B | 24 | 83,216 / 48,384 / 968 | 0.93 | 292 s | none |
| D, round 1 | 28 | 131,457 / 20,992 / 1,031 | 1.39 | 298 s | none |

## 4. End-to-end and TUI evidence

Stage C, route `openai-codex` (oauth), tiers `top` `gpt-6-astra`, `strong` `gpt-5.6-terra`,
`standard` `gpt-6.1-terra`, `fast` `gpt-6-luna`, critic `null`. Raw sessions are kept outside the
repo.

`e2e_mode2`: **pass**. 14,300 input, 28,160 cache-read and 616 output tokens; 0.07 USD; about
40 s. The main session dispatched one `fixer` on `gpt-6-luna` with thinking `xhigh` (its
`thinking_level_change` entry); `README.md` says `receive`; no lead ran.

`e2e_mode1`, first run: **fail**. 98,050 input, 246,400 cache-read and 8,709 output tokens; 0.35 USD;
about 270 s; no stop fired. Children (agent, model): `researcher` strong, two
`researcher-worker` standard, `critic` standard, `scope-critic` standard, then the supervisor's
close-out: `fixer` fast, `curator` standard, `git-ops` fast.

| Assertion | Result |
|---|---|
| `researcher`, `researcher-worker` and `critic` children exist | pass |
| every child's model is its tier's model | fail: the researcher passed `model: "standard"` to `critic` (tier strong) and `scope-critic` (tier top); the override resolved correctly |
| no child of a worker or critic dispatched (depth) | pass, checked from the sessions |
| a `research-*.md` under `.supervisor/working/research/` names both files | fail as written: the supervisor's brief named `plugin-registration-and-discovery.md`, the researcher used it unchanged, and the `curator` close-out moved it to `.supervisor/archive/working/research/`; the file names both `registry.py` and `loader.py` |
| `README.md` unchanged | pass (no agent wrote to it) |

Fixes: (1) the port's `dispatch` tool had dropped the source harness's sentence that an omitted
`model` runs the agent on its own definition's model. The `model` description now reads "Tier
override: top, strong, standard or fast. If omitted, the agent runs on its own tier; pass it only
where the pack prescribes an override" (`extensions/supervisor/index.ts`). (2) The research-file
assertion now accepts any file name under `.supervisor/working/research/` or
`.supervisor/archive/working/research/`; it still requires a file naming both `registry.py` and `loader.py`.

`e2e_mode1`, re-run: **pass**. 90,291 input, 206,336 cache-read and 8,609 output tokens;
0.27 USD; about 270 s; no stop fired. Every dispatch omitted `model`. Children (agent, model,
turns): `researcher` strong 6, two `researcher-worker` standard 4 and 3, `critic` strong 4, then
the close-out: `fixer` fast 5, `curator` standard 5, `git-ops` fast 6. The critic returned PASS with
no findings, so no `scope-critic` ran, as `lead-loop` prescribes. The researcher wrote
`.supervisor/working/research/research-plugin-registration-discovery.md`. All five assertions
pass. `e2e_mode2` was not re-run: the new wording only tells a caller to omit `model`, which that
run already did.

Stage E, agent TUI run (P6-D12), 2026-11-15: real TUI in tmux on socket `p6-tui`, pi 1.5.2.
`./install --profile --prefix` ran from a temporary clone of a temporary upstream (so no
`.install.conf` in the checkout), with the shared login link (D21), in a shell with no API keys
in its environment. Route `openai-codex` (oauth), the only provider with credentials. Usage of
the whole run: 15,261 input, 38,400 cache-read and 708 output tokens; 0.07 USD; 7 turns; the
watcher (1 USD, 900 s) never fired.

| Step | Observation | Result |
|---|---|---|
| 1. First start | notice "Supervisor for Pi is not set up yet. Press Enter to choose its models."; editor prefilled with `/supervisor-config`; status line `supervisor: not set up (/supervisor-config)` | pass |
| 2. Proposal | the select header lists four lines: tier, `openai-codex/<id>`, price per M, roles (`top` `gpt-6-astra`, `strong` `gpt-5.6-terra`, `standard` `gpt-6.1-terra`, `fast` `gpt-6-luna`); options Accept, Change per tier, Cancel | pass |
| 3. Accept, critic | accepted; no critic step (one provider), as designed | pass |
| 4. Web tools | Yes: `npm:pi-web-access` added to the temporary profile's `settings.json`; the default agent directory's `settings.json` checksum unchanged | pass |
| 5. Reload | `pi-web-access:dist` loaded; status line `supervisor on · top openai-codex/gpt-6-astra`; `status` shows "Web tools: active"; `doctor` 0 FAIL, 0 WARN. Neither the install message nor the closing "Supervisor is on" notification is visible after the reload (section 5) | pass, with a follow-up |
| 6. Typo fix | one `dispatch` to `fixer` on `openai-codex/gpt-6-luna`; its session under `<profile>/pi-supervisor/sessions/`; `README.md` says `receive`, the only change | pass |
| 7. Off and on | `/supervisor off`: "Supervisor persona is off. Your model, thinking level and tools are restored.", status line `supervisor off (/supervisor on)`, model back to pi's default; `/supervisor on`: status line `supervisor on · top openai-codex/gpt-6-astra` | pass |
| `pi-supervisor update` | after one commit in the temporary upstream: the clone fast-forwarded, the install re-ran on the recorded choices without asking, then `Packages are already up to date`; exit 0 | pass |
| `pi-supervisor uninstall` | asked to type `pi-supervisor`, removed the launcher and the profile, printed "plain pi, its logins and the memory store are untouched"; exit 0 | pass |
| Anthropic OAuth notice | not exercised live: no Anthropic login (D23); code in `extensions/supervisor/setup.ts` | not exercised |

The tmux server was killed and the temporary directories removed afterwards.

Owner checklist (passed, owner, 2026-11-17; your real install, about 10 minutes and a few cents of
subscription quota). Report any step that differs:

1. In the clone, run `./install`. It creates `~/.config/pi-supervisor` and
   `~/.local/bin/pi-supervisor`, records your choices in `.install.conf`, and prints the PATH line
   if needed.
   **Pass** (owner, 2026-11-17).
2. In a scratch git repo whose `README.md` holds the typo `recieve`, run `pi-supervisor`. The
   editor shows `/supervisor-config`; press Enter.
   **Pass** (owner, 2026-11-17).
3. Read the tier proposal (four lines with roles and prices) and accept it. Answer the critic
   question if it appears (no is fine), and answer yes to the web tools.
   **Pass** (owner, 2026-11-17).
4. After the reload, note which messages you saw, and check that the status line reads
   `supervisor on · top ...`.
   **Pass** (owner, 2026-11-17).
5. Type "Fix the typo 'recieve' in README.md." It should dispatch `fixer`, and the file should be
   fixed.
   **Pass** (owner, 2026-11-17).
6. `/supervisor off`: the status line changes; `/supervisor on` turns it back.
   **Pass** (owner, 2026-11-17).
7. Quit, then run `pi-supervisor update`: it pulls the clone, re-installs without asking and
   updates the pi packages.
   **Pass** (owner, 2026-11-17).
8. Run plain `pi` once: it starts as before, without the supervisor.
   **Pass** (owner, 2026-11-17).

## 5. Known differences and observations

- The transcript audit tool of the source is dropped by decision. The child sessions under
  `<profile>/pi-supervisor/sessions/` (D15) replace it as evidence.
- Setup ends with one notification ("Supervisor is on" and the doctor report), plus the
  pi-web-access message when the web tools are installed. In the stage E TUI run the reload
  redrew the screen and neither was visible afterwards; the status line is the visible
  confirmation. Follow-up: show the closing message after the reload.
- A later notification replaces an earlier one on screen (`status` then `doctor` showed only the
  doctor report).
- The Anthropic OAuth notice (`extensions/supervisor/setup.ts`) is not exercised live: the owner has no
  Anthropic login (D23).
- On the subscription, uncached prompts of different lengths often report the same input count
  (5,430 tokens for cases 1, 4 and 5); cache reads lower the cost of later cases. The harness
  token sums count input and output only; the tables above add cache reads from the sessions.
- A Mode 1 run ends with the supervisor's close-out (`fixer` teardown, `curator` archive,
  `git-ops` commit of the store), as in the source; it adds three children to the run.
