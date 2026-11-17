---
domain: process
summary: Versioning mirrors upstream claude-supervisor's X.y scheme, written X.y.0 in package.json because npm needs three parts
affects: [CLAUDE.md, package.json]
verified: 2026-11-17
source: user 2026-11-17
supersedes:
---
This repo follows the X.y scheme of upstream `pack/skills/repo-workflow/SKILL.md`, with the third part fixed at 0. `CLAUDE.md` names no versioned paths yet, so which change sets raise y is still open until it does.
Why: the user chose parity with upstream.
Rejected: a plain three-part semver scheme.
