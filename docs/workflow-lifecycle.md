# Workflow Lifecycle

This page describes what happens to a request, from routing to close-out. The rules are in
`agents/supervisor.md` and the `lead-loop`, `plan-writing`, `repo-workflow` and `git-safety`
skills; this is a summary.

## Routing

You ask for what you want. The supervisor picks the path:

| Situation | Path |
|---|---|
| Conversation, general advice, one or two small reads | The supervisor answers itself |
| Fully specified, small (a few lines in one to three files), no design decision, cheap to undo | Mode 2: one specialist, `fixer`, `git-ops` or `scout`, with no review |
| As above, except that it is not cheap to undo or needs a design decision | One lead, working alone, with a light review (`Path: minimal`) |
| Everything else | Mode 1: a lead, with review |

You can override the choice: "quick" or "just do it" means Mode 2, and "full", "thorough" or
"with review" means Mode 1. A specialist that finds the task larger than briefed hands it back,
and the supervisor re-routes it to a lead.

## Mode 1

The leads form a chain: `researcher`, then `planner`, then your approval of the plan, then
`executor`. Stages that add nothing are skipped. A stated target or an obvious bug fix goes
straight to `executor`; `planner` runs first only when the approach is open or the work spans
modules with trade-offs. Prose goes to `writer`.

Each lead follows the same loop:

1. **Contract.** The lead writes down the goal, acceptance criteria, scope and constraints from
   the supervisor's brief, and searches the memory store for entries on the task's paths and
   topic.
2. **Fan-out.** The lead does a single unit itself. Two or more independent units go to its
   workers in parallel, usually up to six, with no two units writing the same file.
3. **Review.** `critic` checks the result against the contract. `scope-critic` then rules on
   the critic's findings and lists bloat to cut; it runs only when a finding is above the
   lowest severity or the change is large.
4. **Decide and iterate.** The lead fixes what both reviews support and rejects the rest with a
   reason. Later rounds review only the changes. The loop ends when no blocking finding
   remains, or after three rounds.
5. **Report.** The lead returns a short report with paths to the full output.

The review depth is set per task: `full` (the default for design judgment), `light` (one critic
round, for mechanical or well-specified work), or `none` (only when you ask for it).

Research is written to `.supervisor/working/research/research-<topic>.md` and plans to
`.supervisor/working/plans/plan-<topic>.md`.

## Plans and programs

A plan states decisions and an outline, not code. Its first version puts the open questions
first. You can annotate a plan file and ask for another pass; the planner addresses every note
and implements nothing.

A plan with a `## Work Packages` section is a program. Each package has a goal, the files it
owns, its dependencies, its stages and a status. The supervisor runs a program in waves: every
package whose dependencies are done goes to the lead of its current stage, in parallel. After a
wave, `fixer` updates the statuses and appends one log line per package to the plan. A lead's
open question blocks its package until you answer.

## Git

- `executor` works in a worktree at `.pi/worktrees/<slug>` on its own branch, and lands its
  change set locally: rebase, squash, remove the worktree. Small Mode 2 edits stay in the
  current checkout.
- Nothing is pushed without your confirmation.
- Destructive commands (force-push, `reset --hard`, `clean -fd`, branch and tag deletion,
  dropping a stash, rewriting published history, `--no-verify`) need your explicit request.
- Commits end with `Co-Authored-By: Supervisor for Pi` and carry no other attribution.
- Version bumps are off until you opt in for a repo; the rule is then recorded in its
  `AGENTS.md` or `CLAUDE.md`.

pi has no permission prompt for shell commands, so these are rules the agents follow, not
limits that pi enforces.

## Ending and resuming a session

A long session's context grows; the design expects you to start fresh ones. Plans and the
memory store hold the state, so little is lost.

- `/close-out` finishes the session's work: it removes recorded test residue, has `curator`
  distil a finished plan into memory entries and archive it, and commits a tracked store. It refuses
  while a plan is still open. `/close-out retry` repeats a failed residue removal.
- The supervisor ends a close-out, and each booked wave of a program, with a `Session state:`
  line that says whether it is safe to start a new session and gives the prompt to resume with.
- `/new` starts a fresh session. It is pi's session reset; pi has no `/clear`.
- `/pick-up` in the new session checks the state of the plan and proposes the next step:
  the next wave, an `executor` run, or `/close-out`. `/pick-up <plan path>` names the plan.
  Without a plan it lists the open task cards, and `/pick-up <card>...` claims them.

Steps that only you can run are listed at the end of an answer in a `Run yourself:` block.

## Without a memory store

Outside a project nothing is persisted: no store, no worktree and no version bump. Plans are
written to the current directory. See [memory.md](memory.md#projects-and-one-offs).
