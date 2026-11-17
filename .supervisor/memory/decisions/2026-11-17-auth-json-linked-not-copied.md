---
domain: code
summary: The profile's logins are a symlink to the default agent directory's login file, never a copy
affects: [install, docs/deploy.md]
verified: 2026-11-17
source: .supervisor/archive/working/plans/plan-pi-supervisor-port.md#Decisions
supersedes:
---
The installer links the profile's login file to the default one; `--separate-login` gives an empty file and a fresh login instead.
Why: pi writes the file in place and locks the resolved path, so both profiles share one lock and one set of secrets.
Rejected: copying at setup (two copies of a rotating OAuth refresh token diverge and one login can invalidate the other; it also duplicates secrets).
