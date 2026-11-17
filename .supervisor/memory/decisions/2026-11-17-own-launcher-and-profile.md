---
domain: code
summary: pi-supervisor runs only through its own launcher and agent directory; plain pi and other pi setups stay untouched
affects: [install, README.md, docs/deploy.md]
verified: 2026-11-17
source: .supervisor/archive/working/plans/plan-pi-supervisor-port.md#Decisions
supersedes:
---
The package is installed into a separate profile and started by the `pi-supervisor` launcher; nothing is changed in the default pi agent directory.
Why: the persona takes over the session, so it must load only where the user asks for it.
Rejected: a global install with the persona on by default (takes over every pi session); a `--supervisor` flag or `/supervisor on` in plain pi (the package would still load into every session and child of the default setup).
