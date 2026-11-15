# Context Engineering

Supervisor for Pi inherits its design from claude-supervisor: one supervisor that accumulates
as little context as possible, and a fresh context for every agent it delegates to. The
reasoning, with its sources, is in the claude-supervisor repository
(`docs/context-engineering.md`). This page states how each mechanism is realized on pi.

| Mechanism | On pi |
|---|---|
| A supervisor that reads almost nothing | The main session has no `bash`; lookups go to `scout`, work to leads. That it does not read source itself is an instruction in `agents/supervisor.md`. |
| A fresh context per lead, worker and reviewer | Every dispatch is a separate pi process that sees only its task text |
| Capped reports at every handoff | A child returns its last message only, cut at 50 KB. The shorter word limits per report are instructions in the agent files. |
| Persistent state in files | Plans, research and draft state in `.supervisor/working/`; a new session resumes from the plan with `/pick-up` |
| Curated long-term memory | Entries in `.supervisor/memory/`, retrieved with `grep`, pruned by `curator` into `archive/` |
| Fixed tools and skills per role | Each agent's `tools` list is passed to its process; its preloaded skills are appended to its system prompt |
| Provenance | Entries are claims to verify; research keeps verified facts apart from assumptions; `critic` checks claims against the sources |

## Costs

- **Tokens.** Briefs, reports and review rounds add overhead. For a small one-off task, plain
  `pi` is likely cheaper.
- **Lossy handoffs.** A parent sees a report, not the child's full work. The files hold the
  rest.
- **Instruction load.** The supervisor and the leads follow long instructions, which needs a
  capable model. The agent and skill text was written for Claude models; how well other model
  families follow it has not been measured yet.

[architecture.md](architecture.md#what-is-enforced) lists what the extension enforces and what
is instruction text.
