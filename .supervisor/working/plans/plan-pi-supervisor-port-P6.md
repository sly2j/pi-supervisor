# Plan P6: validation (cross lint, routing test, end-to-end runs, parity record)

Child plan of `plan-pi-supervisor-port.md`, package P6 (Deps: P2, P3, P4, P5, all done). Pointers
are taken against this repo at `2e34f58`, claude-supervisor at `6a49e38` (`CS/`, read-only) and
pi 1.5.2 (`PI/`). `R` is `.supervisor/working/research/research-pi-supervisor-port.md`.

## Open Questions

1. Token spend (one answer covers all stages; see the spend table under `## Decisions`, P6-D9).
   Route: the `openai-codex` subscription login in a temporary profile linked to your logins;
   catalog prices below are what the same tokens would cost on an API key.
   - Stage A, routing pilot (cases 1, 4, 5, 16): about 32k tokens, about 0.55 USD.
   - Stage B, the other 24 routing cases: about 190k tokens, about 3.40 USD.
   - Stage C, the two end-to-end runs: about 490k tokens, about 2 USD.
   - Stage D, up to two tuning rounds, each a full 28-case re-run: about 3.90 USD each.
   - Stage E, the agent's TUI run under tmux (one fixer request): about 0.25 USD.
   Estimated total with both tuning rounds: about 14 USD. The stop thresholds add up to 27 USD
   (A 2, B 6, C 6, D 6 per round, E 1); a stop can overshoot by one in-flight message per
   running child (P6-D6). Routing uses `gpt-6-astra`, the `top` model the
   wizard proposes and the dearest (10/50 USD per M; P6-D3), so the routing stages dominate.
   Recommended: approve A, B, C and E on the subscription now; D only if B scores below 28;
   the `OPENAI_API_KEY` fallback only with a separate yes, since it bills real money.

## Goal

Show that the port works as the source does and record it: a token-free cross lint between
agents and skills, the source's 28-case routing test run on pi, two end-to-end runs through
real leads, the manual TUI checks P2 could not automate, and `docs/parity.md` with one row per
capability. The result is the sign-off verdict for the parent's 1.0.0 step.

Non-goals: building or changing extension code (a failure there becomes a follow-up), docs
other than `docs/parity.md` (P7), the `1.0.0` bump and final push (parent `## Verification`),
`npm publish` and the pi gallery, reopening parent decisions, fixing the P2 notification UX.

Expected change size: about 650 lines. `tests/test_pack_cross.py` 100, `tests/live.py` 130,
`tests/test_live_routing.py` 110, `tests/test_live_e2e.py` 100, `tests/fixtures/live-stop/`
30, `tests/fixtures/e2e-repo/` 30, `docs/parity.md` 150; tuning edits at most 40 changed
lines in agent text.

## Approach

Port the source's live routing check as it is: a single-shot classification prompt that asks
the supervisor for `MODE; AGENT; MODEL`, with the dispatch tool present but blocked
(`CS/tests/test_live_routing.py:24-29,77-108`). Run it, the end-to-end runs and the TUI
checks in temporary profiles made by `./install --profile --prefix`, as the P1 live test does
(`tests/node/dispatch.live.test.ts:23-47`). Run the paid parts in stages, each behind its own
gate and a cost monitor that kills the run at a cap. Write the parity record last, from the
evidence.

Rejected alternatives:
- Letting routing cases dispatch for real and reading the child: 28 real lead runs, tens of
  times the cost, and the source never did it.
- `--exclude-tools dispatch` for the routing run: the persona's `setActiveTools` re-adds it,
  and the source kept the tool and its catalogue in context; a blocking fixture keeps both.
- Writing the live tests in node next to `dispatch.live.test.ts`: the parent names
  `tests/test_live_routing.py`, and the source test is Python; the shared code is small.
- Committing raw session files as evidence: they are large and hold home paths; a summary goes
  in `docs/parity.md` and the raw files stay outside the repo.

## Decisions

- P6-D1 Cross lint (`tests/test_pack_cross.py`, token-free, always on):
  - `agent_skill_refs_exist`: every `skills:` entry of every agent names a directory in
    `skills/` (`CS/tests/test_pack_lint.py:205`).
  - `preloads_match_source`: each agent's `skills:` list equals the source's. The source table
    is a constant in the test, copied from `R:35-51` with a pointer to `CS` `6a49e38`, so the
    test does not need the clone.
  - `dispatch_targets_exist`: every agent named as `agent: "<x>"` in `agents/` and `skills/`
    is a file in `agents/`. The source lacks this; it is the skills-to-agents half of the
    cross check.
  - `docs_paths_exist`: every repo path and command named in backticks in `README.md` and
    `docs/*.md` exists (P7's checkpoint names this test; it passes with no docs present).
- P6-D2 Routing cases. The 28 cases of `CS/tests/test_live_routing.py:31-72` in order, with
  three mappings and nothing else changed:
  - expected models by D6: `fable` -> `top` (cases 16-19), `opus` -> `strong` (22, 24, 25, 26),
    `default` stays;
  - the wrapper lists `MODEL: <top|strong|standard|fast|default>` and says "do not dispatch or
    call tools", as the source does;
  - case 4 asks about `/new` and `/compact`, since pi has no `/clear` (P2-D14).
  Pass is the source's: the parsed line equals `(mode, agent, model)` exactly and the main
  session used at most two assistant turns. No retries and no either-or answers. A token-free
  `routing_cases_valid` test checks that every expected agent is a file in `agents/`, except
  `none`, which goes only with mode `direct` (case 4), and every model is `default` or a tier.
- P6-D3 Routing models. Main session only (nothing is dispatched), on the `top` tier the
  wizard would propose: `proposeTiers` over the eight `openai-codex` catalog models ranks by
  output price, so `top` is `gpt-6-astra` (index 0 of 8). The test writes all four tiers to
  `openai-codex/gpt-6-astra` because only `top` is used, and passes no `--model`, so the
  persona selects it (P2-D7).
  The run is in an empty temporary git repo, so no project context file sways the answer.
- P6-D4 Blocking fixture `tests/fixtures/live-stop/` (a pi extension loaded only in the test
  profile): on `tool_call` it records `{toolName, input}` to `$PI_SUP_STOP_LOG` and returns
  `{block: true, reason: "routing check: tools are disabled"}`, with `terminate: true` on
  every call from the second tool-calling assistant turn on (`PI/docs/extensions.md:973-990`). So a case can make at most one
  tool attempt and one answer, as the source's two-turn check allows. A recorded `dispatch`
  call is reported with the case; it fails the case only through the turn count or a missing
  line.
- P6-D5 Route (D23). `tests/live.py` runs `<launcher> auth check --provider openai-codex
  --json` in the test profile. `ready` uses `openai-codex/<id>`. Otherwise the test skips with
  the reason, unless `PI_SUPERVISOR_ALLOW_API=1` is set, which switches to `openai/<id>` on
  `OPENAI_API_KEY`. Before any prompt it checks that each needed id appears in
  `<launcher> --list-models <provider>` and fails with the missing id, at no cost. The route
  and `authType` go into the report.
- P6-D6 Cost monitor and hard stops. `tests/live.py` starts the main process with `Popen` and
  every 5 s sums `usage.cost.total` and tokens over the main session directory and
  `<profile>/pi-supervisor/sessions` (the reader of `tests/node/dispatch.live.test.ts:82-91`).
  Above the cap it sends SIGTERM, then SIGKILL after 5 s, and fails the case with "cost cap".
  Caps (catalog USD, which the subscription reports too): routing 0.50 per case (the source's
  `--max-budget-usd`) and 6 per run; end-to-end 5 for Mode 1, 1 for Mode 2; the TUI run 1.
  Wall timeouts: 300 s per routing case, 1,200 s per end-to-end run, 900 s for the TUI run.
  The caps act on usage of completed messages (pi records usage at `message_end`), so a stop
  can overshoot by one in-flight message per running child, at most six. A routing run also stops after case 4 if
  the pilot's mean exceeds 0.30 USD per case, which would put 28 cases above 8 USD.
- P6-D7 Gates and stages. `PI_SUPERVISOR_LIVE_ROUTING=1` runs the routing test;
  `PI_SUPERVISOR_ROUTING_CASES=1,4,5,16` limits it to those cases (stage A), and stage B runs
  the rest. `PI_SUPERVISOR_LIVE_E2E=1` runs the end-to-end tests; `-k e2e_mode2` runs one.
  The P1 gate `PI_SUPERVISOR_LIVE=1` is unchanged and runs none of these. Without a gate every
  live test skips, so `python3 -m pytest -q` stays token-free.
- P6-D8 End-to-end runs, in a temporary git repo copied from `tests/fixtures/e2e-repo/` (a
  `README.md` with the typo `recieve`, a 40-line `registry.py` that registers plugins, a
  30-line `loader.py` that discovers them, a `CLAUDE.md` of two lines; the test adds
  `.supervisor/README.md` from `skills/project-memory/templates/store-readme.md`, because only
  `curator` may create a store), with the full wizard tier map: `top`
  `openai-codex/gpt-6-astra`, `strong` `gpt-5.6-terra`, `standard` `gpt-6.1-terra`, `fast`
  `gpt-6-luna` (the `proposeTiers` indices 0, 2, 5, 7 of 8), critic `null`, no `--model`.
  - `e2e_mode1`: "Research two questions and write them up as one research file: how
    registry.py registers plugins, and how loader.py finds them. Review: light." Two independent
    questions are what `agents/researcher.md:30-33` splits across workers. Asserts: a research
    file names both files, at `.supervisor/working/research/research-*.md`, at the path the brief
    names, or under `.supervisor/archive/working/research/` after curator archiving; the child
    sessions include `researcher`, at least one
    `researcher-worker` and `critic`; every child's model is its tier's model; no child of a
    worker exists (depth); `README.md` is unchanged. This exercises the persona, dispatch at
    depth 1 and 2, skill injection (`lead-loop`, `residue`), the lead loop and real tier
    resolution.
  - `e2e_mode2`: "Fix the typo 'recieve' in README.md." Asserts: `README.md` says `receive`,
    the only child is `fixer` on the `fast` model with `--thinking xhigh` in effect, and no
    lead ran. It exercises Mode 2 routing and a write by an allowlisted child.
  Children are found by the agent name in each session's system prompt, as the P1 live test
  does (`tests/node/dispatch.live.test.ts:64-80`).
- P6-D9 Spend table. Basis: the P1 run used 7,448 input and 262 output tokens over four
  sessions with stub prompts, about 1,000 input tokens per turn of pi's own prompt and tool
  definitions. A real supervisor turn adds its body (6,497 characters) and the skill catalog
  (6,079 characters of descriptions), about 3,200 tokens at 4 characters per token, so about
  5,000 input tokens per turn. Output is budgeted at 1,000 tokens per turn for reasoning; a routing case averages 1.3 turns.
  Leads and critics add their injected skills (for example `lead-loop` and `residue`, 10,688
  characters) and grow with tool results; their turn counts are guesses (lead 8, worker 10 each,
  critic 5). Prices from pi's `openai-codex` catalog (USD per M input/output): `gpt-6-astra`
  10/50, `gpt-5.6-terra` 2/12, `gpt-6.1-terra` 1/5, `gpt-6-luna` 0.1/0.5. Cache reads would
  lower all figures.

  | Part | Models | Tokens (in / out) | Catalog cost | Hard stop | Stage |
  |---|---|---|---|---|---|
  | Routing pilot, 4 cases | top `gpt-6-astra` | 26k / 6k | 0.55 USD | 0.50 per case; mean above 0.30 stops the run | A |
  | Routing, 24 cases | top `gpt-6-astra` | 160k / 36k | 3.40 USD | 0.50 per case, 6 per run | B |
  | `e2e_mode1` | all four tiers | 395k / 40k | 1.70 USD | 5 USD, 1,200 s | C |
  | `e2e_mode2` | top, fast | 47k / 5k | 0.25 USD | 1 USD, 1,200 s | C |
  | Tuning round, full re-run | top `gpt-6-astra` | 182k / 42k | 3.90 USD | as stage B | D, at most 2 |
  | TUI run under tmux | top, fast | 47k / 5k | 0.25 USD | 1 USD, 900 s; the watcher kills the socket | E |

  Estimated total with both tuning rounds: about 14 USD at catalog prices, or plan quota on
  the subscription. The stop thresholds add up to 27 USD (stage A 2, B 6, C 6, D 6 per round, E 1), plus the
  in-flight overshoot of P6-D6. Every stage reports its measured tokens and cost, and the next stage's
  estimate is redone from them before it starts.
- P6-D10 Tuning, in scope: at most two rounds after stage B, only when a case fails. Edits are
  confined to `agents/supervisor.md` lines 18-47 (Routing Judgment) and the `description:`
  line of a routed agent; each edit names the failing cases it targets, stays within the word
  caps and `routing_scope` phrases the lints enforce, and is a rule for an observed failure
  only (the owner's style rule in `CLAUDE.md`). Each round re-runs all 28 cases, because a
  routing edit can move any case (about 3.90 USD per round). The better of the rounds is kept;
  a round that scores lower is reverted. Follow-up work, not P6: a third round, edits to other
  agent or skill text, extension changes (for example listing agents in the `dispatch` tool
  description, which the source's Agent tool did), and model-specific prompt variants.
- P6-D11 Evidence. Raw files go to `$PI_SUPERVISOR_EVIDENCE/<UTC timestamp>-<test>/`, outside
  the repo (the executor sets it to `/Users/sjoosten/Work/pi-supervisor-work/p6-evidence/`):
  the main session, the child sessions, the stop log, the route, and a `summary.json` per run
  (per case or child: agent, model, turns, tokens, cost, parsed line). Nothing copies
  `auth.json` or `settings.json`. `docs/parity.md` holds the summaries only: tables of agents,
  models, tokens and costs, and short quoted result lines, no session content.
- P6-D12 Agent TUI run (stage E) in tmux, in a temporary profile and prefix with linked logins,
  under a private socket (`tmux -L p6-tui`), driven with `send-keys` and read with
  `capture-pane -p`. A watcher with the `tests/live.py` session sum kills the socket at 1 USD or
  900 s (P6-D6), then cleanup step 8 runs. Steps and what each records:
  1. Start `<prefix>/bin/pi-supervisor` in a temporary git repo copied from `e2e-repo`:
     the editor shows `/supervisor-config` prefilled (P2-D1).
  2. Enter: the proposal select renders one line per tier with role and price; capture it.
  3. Accept, critic: the confirm appears only with two or more providers; answer no.
  4. Web tools yes: `npm:pi-web-access` installs into the temporary profile's
     `settings.json`; the default agent directory's `settings.json` checksum is unchanged.
  5. After the reload: the doctor report and "Supervisor is on" (record whether both are
     visible; the P2 observation), the status line `supervisor on · top openai-codex/...`, and
     `web_search` present (`/supervisor-config status`).
  6. One request, "Fix the typo 'recieve' in README.md.": the screen shows a `dispatch` to
     `fixer`, and its session appears under the D15 directory.
  7. `/supervisor off`, then `/supervisor on`: the status line follows. Then
     `<prefix>/bin/pi-supervisor update` runs in the clone: it reuses the choices recorded in
     `<clone>/.install.conf` and asks before changing any of them; capture its output.
  8. Quit, kill the socket, `<prefix>/bin/pi-supervisor uninstall` for the temporary profile and
     prefix.
  The agent never runs `/login` or `/logout`: through the D21 link they would change the
  user's real logins.
- P6-D13 Anthropic OAuth notice (P2-D2.5): the user has no Anthropic login (D23), so it cannot
  be seen live. The parity row records it as "not exercised live" with the code pointer
  `extensions/supervisor/setup.ts:205`.
- P6-D14 `docs/parity.md` layout: (1) verdict and date; (2) one row per row of the `R` Q5
  mapping table (`R:371-409`), columns source capability, disposition (carried, adapted,
  dropped, not required), how, evidence (a test name, a run in section 4, or the reason for a
  drop); the dispositions come from the parent's Parity map and are not re-decided; (3) the
  28 routing cases: request (abridged), expected, got, pass, and for a failure the tuning round
  that addressed it or the follow-up task; (4) end-to-end and TUI evidence summaries with
  route, models, tokens and cost; (5) known differences and observations: the transcript audit
  tool `CS/tools/audit/audit.py` dropped by decision, child sessions kept as its replacement
  evidence (D15), the two notifications before the reload, and the OAuth notice.
- P6-D15 Sign-off rules, recorded in `docs/parity.md` section 1:

  | Part fails | Meaning | 1.0.0 |
  |---|---|---|
  | Cross lint | a pack defect; fixed in P6 if it is agent or skill text, else a follow-up | held until it passes |
  | Routing below 24 of 28 after the tuning rounds | below the D24 bar; reported to the user with the failing cases | held; the user decides |
  | Routing 24 to 27 | passes D24; each failure listed with its follow-up | not held |
  | `e2e_mode1` or `e2e_mode2` | a defect (wrong model, missing child, crash) or a judgement failure (no critic round, wrong agent); either is a follow-up, and a re-run needs a new spend approval at the stage C cost | held until both pass |
  | Agent TUI steps 1-7 | a bug in P2's code; follow-up | held |
  | User checklist | as the agent steps; rendering or wording issues alone are follow-ups | held only for a functional failure |
  | Parity record has a row without evidence or reason | incomplete | held |

  P6 does not set the version; the parent's `## Verification` sets `1.0.0` after a "pass"
  verdict.
- P6-D16 Safety for execution: every automated run uses a temporary profile and prefix made by
  `./install --profile --prefix` and removed by `./install --uninstall --yes` in a `finally`
  (`residue`); `PI_CODING_AGENT_DIR` is deleted from the child environment as the P1 test does;
  nothing reads, copies or commits `auth.json` or any credential file; the user's
  `~/.pi/agent`, `~/.config/pi-supervisor` and `~/.local/bin` are touched only by the user in
  the checklist below. `test_install.py::no_secrets` passes before any push.

## Outline

`tests/test_pack_cross.py` (new): constants `SOURCE_PRELOADS: dict[str, list[str]]` (15
agents, `R:35-51`); helpers reuse the frontmatter reader of `tests/test_agents_lint.py`
(import it, do not copy). Tests per P6-D1.

`tests/live.py` (new, helper module, not collected):
```python
class LiveProfile:  # context manager: install into tmp profile/prefix, uninstall on exit
    launcher: Path; profile: Path; provider: str; route: str
    def __init__(self, tiers: dict[str, str], extra_packages: list[Path] = ()): ...
    def require_models(self, ids: list[str]) -> None  # --list-models check, P6-D5
    def run(self, prompt: str, cwd: Path, cap_usd: float, timeout: int) -> Run
    def child_sessions(self) -> list[Child]  # agent, model, thinking, tools, usage
    def keep_evidence(self, name: str, summary: dict) -> Path  # P6-D11
Run = dataclass(events: list[dict], turns: int, text: str, usage: Usage, stopped: str | None)
```
- Package copy as `tests/node/dispatch.live.test.ts:32-37`, but with the real `agents/` and
  `skills/`; `extra_packages` adds `tests/fixtures/live-stop/` with
  `<launcher> install <path>` into the test profile only.
- The main session directory is `--session-dir <tmp>/main`; children are under
  `<profile>/pi-supervisor/sessions/<main session id>/` (`extensions/supervisor/index.ts:61`).
- Split stdout on LF only; parse lines starting with `{` (P1 invariant).

`tests/test_live_routing.py` (new): `CASES` (28 tuples, P6-D2), `WRAPPER`, `parse(text)`,
one parametrized live test with the P6-D7 skip on it alone (the token-free tests always run), a session fixture that prints totals and
writes the summary (`CS/tests/test_live_routing.py:92-97`), and the token-free
`routing_cases_valid`.

`tests/test_live_e2e.py` (new): `e2e_mode1`, `e2e_mode2` per P6-D8.

`tests/fixtures/live-stop/` (new): `package.json` (pi package, one extension) and `index.ts`
per P6-D4. `tests/fixtures/e2e-repo/` (new): the four files of P6-D8.

`docs/parity.md` (new) per P6-D14.

Gotchas:
- Node's `--test` must not collect `tests/fixtures/live-stop/index.ts`; name it `index.ts`
  (not `*.test.ts`) as the scripted provider does.
- `--thinking xhigh` for `fixer` shows in its session as a `thinking_level_change` entry;
  check that entry, not the tier string.

## Slices

1. Cross lint: agent and skill references are checked without tokens.
   - Unit: `tests/test_pack_cross.py`.
   - Tests:
     - `agent_skill_refs_exist: agents/*.md -> every skills entry is a dir in skills/`
     - `preloads_match_source: each agent -> skills list equals SOURCE_PRELOADS[name]`
     - `dispatch_targets_exist: agent: "<x>" in agents/ and skills/ -> agents/<x>.md exists`
     - `docs_paths_exist: no README.md or docs -> passes; a doc naming tests/nope.py -> fails`
       (the second case on a temporary copy)
   - Checkpoint: `python3 -m pytest -q tests/test_pack_cross.py` passes, and a planted missing
     skill name in a copied agent makes `agent_skill_refs_exist` fail.
2. Live harness and routing test, token-free parts first, then stage A, then stage B.
   - Units: `tests/live.py` + `tests/fixtures/live-stop/`; `tests/test_live_routing.py`.
   - Tests:
     - `routing_cases_valid: 28 cases -> agents exist or none with direct, models in {default, top, strong}`
     - `parse_line: "MODE: 2; AGENT: fixer; MODEL: default" -> ("2", "fixer", "default");
       "no line" -> None`
     - `stop_fixture_blocks (scripted provider, token-free): {dispatch: ...} -> stop log holds
       the dispatch input; no child session exists`
     - `cost_monitor_kills: the monitor over a "sleep 30" process and a session directory
       holding one assistant entry with usage cost 1, cap 0.5 -> stopped "cost cap" within
       10 s, process gone` (the faux provider reports zero cost, so no pi run is used)
     - `route_skip: auth check not ready, no ALLOW_API -> skipped with the reason`
     - live: `routing[<n>]: case n -> parsed line equals expected, turns <= 2`
   - Checkpoint: `python3 -m pytest -q` passes with the live tests skipped; then, after the
     user's go-ahead, stage A
     (`PI_SUPERVISOR_LIVE_ROUTING=1 PI_SUPERVISOR_ROUTING_CASES=1,4,5,16 python3 -m pytest -q
     tests/test_live_routing.py -s`), re-estimate from its measured cost, then stage B. Record
     the score and per-case lines.
3. Tuning rounds (only if stage B is below 28 of 28, and only with stage D approved).
   - Unit: `agents/supervisor.md` Routing Judgment and routed agents' `description:` lines.
   - Tests: `python3 -m pytest -q tests/test_agents_lint.py` passes after each edit; live
     `routing[*]` full re-run; the score is not lower than the previous round's.
   - Checkpoint: the kept round's score and its per-case lines; a reverted round is logged.
4. End-to-end runs (stage C).
   - Units: `tests/test_live_e2e.py` + `tests/fixtures/e2e-repo/`.
   - Tests: `e2e_mode1` and `e2e_mode2` as in P6-D8.
   - Checkpoint: `PI_SUPERVISOR_LIVE_E2E=1 python3 -m pytest -q tests/test_live_e2e.py -s`
     passes; evidence directories exist under `$PI_SUPERVISOR_EVIDENCE`.
5. Agent TUI run (stage E) and the parity record.
   - Units: the tmux run per P6-D12 (no repo file); `docs/parity.md`.
   - Tests: each P6-D12 step's observation recorded as pass or fail in `docs/parity.md`
     section 4; `parity_rows_complete: docs/parity.md section 2 -> one row per R Q5 row, none
     with an empty evidence cell` (in `tests/test_pack_cross.py`).
   - Checkpoint: `python3 -m pytest -q` and `node --test` pass; `docs/parity.md` states the
     verdict per P6-D15; `tmux -L p6-tui ls` reports no server; no temporary profile remains.

## Verification

From the P6 worktree: `python3 -m pytest -q` and `node --test` pass with every live test
skipped; the stage logs show the route, the measured tokens and cost of each stage, the
routing score, and both end-to-end passes; `docs/parity.md` has a verdict, a row per capability
with evidence, and every failing routing case with its follow-up. Then the user runs the
checklist below and the result is added to `docs/parity.md` section 4 before the parent's
1.0.0 step.

User checklist (your real launcher; about 10 minutes, about 0.20 USD of subscription quota):

1. In the clone: `./install`. It creates `~/.config/pi-supervisor` and
   `~/.local/bin/pi-supervisor`, records your choices in `<clone>/.install.conf`, and prints the
   PATH line if needed.
2. In a scratch git repo with a `README.md` holding the typo `recieve`: run `pi-supervisor`.
   The editor shows `/supervisor-config`; press Enter.
3. Read the tier proposal: four lines with roles and prices, readable in the select. Accept.
   Answer the critic question if it appears (no is fine). Answer yes to the web tools.
4. After the reload, note which messages you saw (the doctor report, "Supervisor is on", or
   both), and that the status line reads `supervisor on · top ...`.
5. Type "Fix the typo 'recieve' in README.md." It should dispatch `fixer`, and the file
   should be fixed.
6. `/supervisor off`: the status line changes; `/supervisor on` turns it back.
7. Quit, then run plain `pi` once: it starts as before, without the supervisor.
8. In the clone, run `pi-supervisor update`: it reuses the choices in `<clone>/.install.conf`
   and asks before changing any of them.
9. Report any step that differed.

## Risks

- `gpt-6-astra` or another catalog id may not be offered on the user's subscription; the
  `require_models` check fails first at no cost, and the tier map then follows the wizard's
  proposal over the models that are available.
- Routing is classification by prompt; non-Claude models may answer in a different format.
  An unparsable line fails the case, as in the source, so format drift shows as failures.
- Reasoning output may exceed the 1,000-token budget per turn; the pilot (stage A) measures it
  before the bulk run, and the caps bound it.
- The subscription may rate-limit 28 sequential runs; a rate-limit error is a failed run, not
  a routing failure, and the case is re-run once and marked so.
- The pi dispatch tool lists no agents, unlike the source's Agent tool catalogue; if routing
  fails on agent choice, the fix may be outside P6's tuning scope (P6-D10).

## Scope Notes

- In scope: the files in `## Outline`, the P6-D10 tuning edits, the agent TUI run, the user
  checklist text. Out of scope: extension code, other docs (P7), the version bump and final
  push, `npm publish`, the pi gallery, the P2 notification UX.
- Not to reopen: D24 pass bar (24 of 28 sign-off, 28 target, every failure listed); D23 route
  order; D6 tier names; the transcript audit drop; child sessions as evidence (D15); D20 and
  D21 profile and login link.
- The P2 Todo item "Verification: manual TUI run" is carried out here (P6-D12 and the user
  checklist).
- Memory: `.supervisor/memory/` holds no entries.
- Amend parent (for `fixer`):
  1. P6 Owns adds `tests/live.py`, `tests/test_live_e2e.py`, `tests/fixtures/live-stop/`,
     `tests/fixtures/e2e-repo/`, and the P6-D10 tuning lines in `agents/supervisor.md` and
     routed agents' `description:` lines.
  2. `## Verification`, model usage paragraph: replace the P6 estimates with P6-D9's table.
  3. Open question 1 moves to this plan's open question 1.
- Deviation (recorded at execution): one description string in `extensions/supervisor/index.ts`
  (the `dispatch` `model` parameter) was changed to restore the source harness's "if omitted, the
  agent runs on its own tier" rule. The harness tests live in `tests/test_live_harness.py`.

## Assumptions

- `tool_call` blocking works in print and JSON mode: checked by `stop_fixture_blocks`.
- pi writes session entries with usage as each turn ends: checked by `cost_monitor_kills`
  and by the stage A totals matching the final sums.
- `<launcher> install <local path>` adds a second package to the test profile only: checked
  by `stop_fixture_blocks` (the fixture loads) and the default directory checksum.
- `<launcher> --list-models <provider>` runs without a model call: checked in stage A with the
  cost monitor reading zero before the first prompt.

## Log

## Todo

- [x] S1: `tests/test_pack_cross.py` with the four cross tests; planted failure check
- [x] S2: `tests/live.py`, `tests/fixtures/live-stop/`, token-free harness tests
- [x] S2: `tests/test_live_routing.py` with 28 mapped cases and `routing_cases_valid`
- [x] S2: stage A (pilot), re-estimate, stage B; record score and per-case lines
- [x] S3: tuning rounds if needed and approved (at most two); keep the better round
- [x] S4: `tests/fixtures/e2e-repo/`, `tests/test_live_e2e.py`; stage C; evidence kept
- [x] S5: agent TUI run in tmux (stage E); clean up the socket and profile
- [x] S5: `docs/parity.md` with verdict, capability rows, routing table, evidence, differences
- [x] S5: `parity_rows_complete`; `python3 -m pytest -q` and `node --test` pass
- [ ] User checklist run; result added to `docs/parity.md` section 4
