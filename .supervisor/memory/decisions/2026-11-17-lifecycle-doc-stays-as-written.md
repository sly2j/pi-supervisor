---
domain: writing
summary: docs/workflow-lifecycle.md is user-facing explanation, not a prompt; its close-out sentence stays as written despite differing from the agent definitions
affects: [docs/workflow-lifecycle.md]
verified: 2026-11-17
source: user 2026-11-17
supersedes:
---
The close-out paragraph of `docs/workflow-lifecycle.md` is not reworded to match `agents/supervisor.md` on who commits memory changes or when test leftovers are removed.
Why: the doc explains the flow to users rather than instructing agents, and the user finds it mostly correct behaviorally.
Rejected: rewording it to the agent-level detail (curator never commits, fixer tears down first).
