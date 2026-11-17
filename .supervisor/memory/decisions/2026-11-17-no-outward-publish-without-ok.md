---
domain: process
summary: npm publish and pi gallery listing need the user's separate confirmation each time; the private GitHub remote push is authorized
affects: [package.json]
verified: 2026-11-17
source: .supervisor/archive/working/plans/plan-pi-supervisor-port.md#Scope Notes
supersedes:
---
No agent runs `npm publish` or lists the package in the pi gallery without the user's explicit word for that step.
Why: both are public and hard to undo; the user authorized only the private remote.
Rejected: treating the earlier plan approval as covering publication.
