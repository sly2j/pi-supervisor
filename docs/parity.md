# Parity record

## 1. Verdict

**Not yet run.** The token-free parts are in place: the cross lint (`tests/test_pack_cross.py`),
the live harness (`tests/live.py`, `tests/test_live_harness.py`) and the live tests. Sections 3 and 4
are filled from the live runs; section 5 holds what is known already.

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

Not yet run. Filled from stage A and B: the 28 cases of the source with D6 tier names, one row per
case (request abridged, expected, got, pass), and for each failure the tuning round or follow-up.

## 4. End-to-end and TUI evidence

Not yet run. Filled from stage C (`e2e_mode1`, `e2e_mode2`) and stage E (steps 1-7 of the agent TUI
run, then the owner checklist): route, models, tokens, catalog cost, pass or fail. Raw sessions stay
outside the repo.

## 5. Known differences and observations

- The transcript audit tool of the source is dropped by decision. The child sessions under
  `<profile>/pi-supervisor/sessions/` (D15) replace it as evidence.
- Before the reload, setup shows two notifications (the doctor report and the persona message).
- The Anthropic OAuth notice (`extensions/supervisor/setup.ts`) is not exercised live: the owner has no
  Anthropic login (D23).
