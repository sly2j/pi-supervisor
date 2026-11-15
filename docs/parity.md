# Parity record

## 1. Verdict

**Pending** (2026-11-15). Stages A to D are run: the cross lint passes, routing scores 28 of 28
after one tuning round, and `e2e_mode2` passes. `e2e_mode1` failed (section 4), which holds 1.0.0
until a re-run passes. The verdict waits for that re-run, stage E (agent TUI run) and the owner
checklist.

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

`e2e_mode1`: **fail**. 98,050 input, 246,400 cache-read and 8,709 output tokens; 0.35 USD;
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

Follow-ups: (1) the lead downgraded its reviewers, a judgement failure no agent text prevents;
(2) the research-file assertion does not allow a brief-supplied name or the close-out archive,
both of which the agent text permits. A re-run needs a new spend approval at the stage C cost.

Stage E (agent TUI run) and the owner checklist: pending.

## 5. Known differences and observations

- The transcript audit tool of the source is dropped by decision. The child sessions under
  `<profile>/pi-supervisor/sessions/` (D15) replace it as evidence.
- Before the reload, setup shows two notifications (the doctor report and the persona message).
- The Anthropic OAuth notice (`extensions/supervisor/setup.ts`) is not exercised live: the owner has no
  Anthropic login (D23).
- On the subscription, uncached prompts of different lengths often report the same input count
  (5,430 tokens for cases 1, 4 and 5); cache reads lower the cost of later cases. The harness
  token sums count input and output only; the tables above add cache reads from the sessions.
- A Mode 1 run ends with the supervisor's close-out (`fixer` teardown, `curator` archive,
  `git-ops` commit of the store), as in the source; it adds three children to the run.
