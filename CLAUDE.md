# Supervisor for Pi

This is the source repo for Supervisor for Pi, a multi-agent orchestration layer for the pi coding harness, ported from claude-supervisor. It is a pi package run through its own `pi-supervisor` launcher and profile, so plain pi and other pi setups stay untouched.

- Install from a clone with `./install` (see `./install --help`); it creates the profile `~/.config/pi-supervisor` and the launcher `~/.local/bin/pi-supervisor`. Re-running it is the update step.
- Checks: `python3 -m pytest -q` (install script, pack lint, memory script) and `node --test` (extension logic; Node 22.19 or later, no dev dependencies).
- `install` must stay a POSIX `sh` script with no dependencies beyond pi.
- Tests and smoke runs use temporary `--profile` and `--prefix` locations. Never write to `~/.pi/agent`, and never read, copy or commit any `auth.json` or other credential.
- Versioning is the `package.json` `version` field, written `X.y.0` (npm needs three parts; the third stays 0), starting from `1.0.0`. y rises by one once per change set that lands on the default branch and touches a versioned path; X rises, and y resets to 0, when a major change lands; the user, `CLAUDE.md` or the plan says what is major. There is no `VERSION` file.
- Commits use Conventional Commits and end with `Co-Authored-By: Supervisor for Pi`.
- Default branch is `main`; remote `origin` is the private repo `sly2j/pi-supervisor`. Push `main` after each landed package, only when the `no_secrets` check in `tests/test_install.py` passes.
- Entries in `.supervisor/` govern work on this repo only. Product behaviour belongs in the package itself.
- Owner's style rule is simplicity: add rules to agent files only for observed failures, and keep word counts and line lengths down.
