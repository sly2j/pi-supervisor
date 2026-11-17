---
domain: process
summary: Live model runs (routing test, end-to-end runs, TUI check) need the user's go-ahead for spend before each batch
affects: [tests/live.py, tests/test_live_routing.py, tests/test_live_e2e.py]
verified: 2026-11-17
source: .supervisor/archive/working/plans/plan-pi-supervisor-port.md#Scope Notes
supersedes:
---
Before a live batch, state the stages, cost estimate and stop thresholds and wait for approval; the subscription login is preferred over API keys.
Why: live runs spend real money; past approvals named their own stages and caps.
Rejected: an API-key fallback (the user declined it for the validation runs).
