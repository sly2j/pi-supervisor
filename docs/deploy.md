# Deploying Supervisor for Pi

This runbook takes you from a clone to a working install of Supervisor for Pi, the pi port of [Supervisor for Claude](https://github.com/sly2j/claude-supervisor) (its runbook is [docs/deploy.md](https://github.com/sly2j/claude-supervisor/blob/main/docs/deploy.md)). It works on macOS and Linux with a POSIX shell (Windows is not supported) and needs pi 1.5.2 or newer, Node 22.19 or newer, `git` (to clone, and for updates) and credentials for at least one model provider: a pi login or a provider API key. `python3` is needed for the memory script, and `bash` and `zip` for `/project-backup`.

## Steps

First time (the repository is private, so the clone needs your GitHub access):

```bash
git clone git@github.com:sly2j/pi-supervisor.git ~/Work/pi-supervisor
REPO=~/Work/pi-supervisor
```

An existing install updates itself with `pi-supervisor update` (see [Update](#update)).

Then install into a profile: a private pi agent directory (`~/.config/pi-supervisor`) with its own launcher, settings, packages and sessions; plain `pi` is untouched.

```bash
"$REPO/install"        # profile ~/.config/pi-supervisor + launcher ~/.local/bin/pi-supervisor
```

Install ends with `Start:`, `Update:` and `Uninstall:` lines that give the three commands to use from then on. If it prints `WARNING <bin> is not on your PATH; add this to your shell profile, then open a new terminal:` followed by `export PATH="<bin>:$PATH"`, `pi-supervisor` will not be found until that line is in the shell profile (`<bin>` is `~/.local/bin` by default); until then, those three lines give the launcher's full path.

Start it with `pi-supervisor`. On the first interactive start there is no configuration yet: a notice says `Supervisor for Pi is not set up yet. Press Enter to choose its models.` and the input line already holds `/supervisor-config`. Press Enter to run the tier wizard (see [Model Tiers](#model-tiers)). When it finishes, the session runs as `supervisor`: on the `top` model, with the supervisor's tool list (no `bash`) and its instructions appended to pi's system prompt.

Install records your choices in the clone, so no later run needs an option repeated (see [What Install Does](#what-install-does)).

## What Install Does

- Creates the profile directory, `~/.config/pi-supervisor` by default (`--profile DIR` for another dir), with mode 0700.
- Links the profile's `auth.json` to your pi logins (see [Logins](#logins)).
- Registers the clone in the profile with `pi install <clone>`, run with `PI_CODING_AGENT_DIR` set to the profile. pi loads a local path in place, so keep the clone where it is.
- Writes the launcher `<prefix>/bin/pi-supervisor` (`--prefix P`, default `~/.local`), a shell script that sets `PI_CODING_AGENT_DIR` to the profile and runs `pi` (see The Launcher).
- Records the prefix, the profile and the login mode in `.install.conf` in the clone (git-ignored). Every later run reuses the record, so you give an option only to change a choice. The record makes it one install per clone.
- Re-running `install` is safe to repeat; `pi-supervisor update` does it for you (see [Update](#update)).

It then prints `Profile:`, `Logins:`, `Launcher:` and `Recorded:` lines and the three commands. It never edits your shell startup files.

| Flag | Effect |
|---|---|
| `--prefix DIR` | Write the launcher to `DIR/bin` (default `~/.local`) |
| `--profile DIR` | Use `DIR` as the profile (default `~/.config/pi-supervisor`) |
| `--shared-login` | Link the profile's `auth.json` to your pi logins (default) |
| `--separate-login` | Give the profile its own `auth.json` instead of the link |
| `--update` | `git pull` the clone, then install again with the recorded choices; takes no other option except `--yes` |
| `--uninstall` | Remove the launcher, the profile and the record (see [Uninstall](#uninstall)) |
| `--yes` | Do not ask for confirmation |
| `-h`, `--help` | Print the usage text |

A run that would change a recorded choice lists the change first, for example:

```
This changes your recorded install:
  logins: separate -> shared (deletes the logins in <profile>/auth.json)
Continue? [y/N]
```

Anything but yes stops it with `install: not confirmed; nothing changed`; so does a run that cannot read an answer, such as one from a script, unless you pass `--yes`. Moving the launcher with `--prefix` removes the previous launcher. Moving the profile with `--profile` leaves the previous profile in place for you to delete.

Install stops with an `install:` message and exit code 1, without changing anything, when:

- `pi` is not on your `PATH`, or is older than 1.5.2 (run `pi update`, then install again);
- the profile would be a plain pi agent directory (`~/.pi/agent`, or the directory an exported `PI_CODING_AGENT_DIR` names), your home directory or `/`;
- a file that install did not write already exists at the launcher path;
- `--prefix` or `--profile` contains a `.` or `..` path component;
- the clone is not writable, so the record cannot be kept there.

### Logins

pi keeps its logins in `auth.json` inside the agent directory, so a new profile would start without any. Install handles this in one of two ways.

- **Linked (default).** `<profile>/auth.json` is a symbolic link to the `auth.json` of your plain pi (`~/.pi/agent/auth.json`, or the one in an exported `PI_CODING_AGENT_DIR`). Your existing logins work at once and no secret is copied. The trade-off: a `/login` or `/logout` inside `pi-supervisor` also changes the logins of plain `pi`, and the reverse. If plain pi has no `auth.json` yet, install creates an empty one (mode 0600).
- **Separate (`--separate-login`).** The profile gets its own `auth.json`, empty at first. Run `/login` once inside `pi-supervisor`. Logins are then fully separate.

The mode is recorded, so a later `install` or `pi-supervisor update` keeps it and never removes a separate login by itself. To switch, run `"$REPO/install" --separate-login` or `"$REPO/install" --shared-login`; it says what the switch creates or deletes and asks before it does it. Switching from separate back to linked deletes the profile's own `auth.json`, so its logins are lost.

Provider keys in environment variables (`OPENAI_API_KEY` and others) reach both `pi` and `pi-supervisor` in either mode. Settings, installed packages and `models.json` are per profile (see [Changing Or Removing A Provider](#changing-or-removing-a-provider)).

## The Launcher

```bash
pi-supervisor                  # start pi in the profile
pi-supervisor -c               # any pi option works, here: continue the last session
pi-supervisor list             # any pi subcommand works, here: the profile's packages
pi-supervisor --list-models    # the provider/id models the tiers can use
pi-supervisor update           # pull the clone, install again, update the profile's packages
pi-supervisor uninstall        # remove the launcher and the profile
```

The launcher is a short shell script that sets `PI_CODING_AGENT_DIR` to the profile and runs `pi` with all your arguments. It has two subcommands of its own, `update` and `uninstall`, each only when it is the sole argument (see [Update](#update) and [Uninstall](#uninstall)); everything else goes to `pi`, inside the profile, so `pi-supervisor update --extensions` or `pi-supervisor update <source>` is pi's own `update`. Plain `pi` keeps its settings, packages and sessions, and does not load the package.

- If `pi` is not on your `PATH`, the launcher prints `pi-supervisor: pi not found on PATH` and exits 127.
- `update` and `uninstall` run the clone's `install`. If the clone is gone, the launcher prints `pi-supervisor: <clone> is missing; clone the repository again and run ./install there`.
- Install marks the launcher with a `# managed by pi-supervisor` line; install and uninstall touch a file at the launcher path only when it carries that line.
- The sessions of dispatched agents are kept under `<profile>/pi-supervisor/sessions/<parent session id>/`. Nothing prunes them; delete old directories there when they grow.

## Commands

All commands are typed inside `pi-supervisor`.

| Command | Effect |
|---|---|
| `/supervisor-config` | Run the tier wizard (see [Model Tiers](#model-tiers)) |
| `/supervisor-config status` | Show the configuration path, the four tiers with their agents, the critic model, the supervisor state and whether the web tools are active |
| `/supervisor-config doctor` | Run the readiness checks (see [Doctor Checks](#doctor-checks)) |
| `/supervisor` | Show the supervisor state |
| `/supervisor off` | Turn the supervisor off for this session and restore the model, thinking level and tools it replaced |
| `/supervisor on` | Turn it back on |
| `/close-out [retry]` | Close out the session's work: archive the finished plan, update memory |
| `/pick-up [plan path \| card...]` | Re-enter a plan or pick task cards in a new session |
| `/project-backup` | Zip the project into the backup directory |
| `/meeting-summary <transcript path> [notes]` | Write minutes from a transcript |
| `/supervisor-memory <externalize\|link\|status> [options]` | Keep this project's memory outside the repo (see [Memory](#memory)) |

`/supervisor off` lasts for the session, including after `/reload` and when the session is resumed. A new session (`/new`, or a new start) begins with the supervisor on. With it off, the session behaves as plain pi with the package's `dispatch` tool and commands still loaded. Completing `/supervisor-config` turns the supervisor on again.

## Update

```bash
pi-supervisor update     # pull the clone, install again, update the profile's packages
pi update                # the pi program, shared by pi and pi-supervisor
```

`pi-supervisor update` pulls the clone with `git pull --ff-only`, runs `install` again with the recorded choices, and then updates the packages installed in the profile, such as `pi-web-access`. Restart `pi-supervisor` afterwards; the package is loaded from the clone, so the pulled files are what it runs. If the pull fails (for example on local changes in the clone), it stops with `git pull failed` and the clone's path, and nothing is reinstalled. `"$REPO/install" --update` does the first two steps without the launcher.

## The Top Tier

Three agents (`supervisor`, `writer`, `scope-critic`) run on the `top` tier, and `planner` and its `critic` (unless a critic model is set; see [Critic Model](#critic-model)) join them for programs, open cross-module designs, large or unfamiliar domains, or when you ask for thorough planning (see [Models And Cost](architecture.md#models-and-cost)). The `top` tier costs whatever the model you map to it costs. To run these agents on a cheaper model, map `top` to it with `/supervisor-config` (see [Model Tiers](#model-tiers)).

## API Providers

A profile can run on any provider pi has credentials for: a pi login (`/login`, for example a ChatGPT or Claude subscription) or a provider key in the environment, with the provider's models mapped to the four tiers (`top`, `strong`, `standard`, `fast`). Agents do not name models; each has a tier, and the configuration maps each tier to a `provider/id` model. How well a model follows the agents' tool calls varies by model, so try a candidate on a small task first.

### Model Tiers

| Tier | Agents |
|---|---|
| `top` | `supervisor` (your session), `writer`, `scope-critic` |
| `strong` | `planner`, `researcher`, `critic`, `writer-worker` |
| `standard` | `executor`, `curator`, `executor-worker`, `planner-worker`, `researcher-worker` |
| `fast` | `fixer`, `git-ops`, `scout` |

The supervisor overrides a tier per dispatch: `strong` for `writer` on short, low-stakes prose and for `executor` on difficult work, `top` for `planner` (see The Top Tier).

`/supervisor-config` runs the wizard. Cancelling at a selection list stops it and writes no configuration (`Setup cancelled; nothing was changed.`); Escape at the web-tools question counts as no.

1. **Models.** The wizard collects the models that have credentials. If there are none, it stops; see [Missing Credentials](#missing-credentials).
2. **Proposal.** It shows one line per tier with the model, its price per million input and output tokens, and the agents that use it. On the first run the proposal takes the models of one provider (the provider of the session's current model, else the one with the most models), sorts them by price and spreads them over the four tiers, dearest first. With fewer than four models, neighbouring tiers share one, and the wizard says so. On a later run the proposal is your current configuration. Choose `Accept` to continue; `Change top`, `Change strong`, `Change standard` or `Change fast` to pick any available model for that tier, from a list sorted dearest first; `Use another provider` (shown when two or more providers have credentials) to get a new proposal from that provider; or `Cancel`.
3. **Critic model (optional).** A list, shown only when two or more providers have credentials; see [Critic Model](#critic-model).
4. **Web tools (optional).** Shown when the `web_search` and `fetch_content` tools are not present. The wizard offers to install the third-party package `pi-web-access` (`npm:pi-web-access`), which provides both, into the `pi-supervisor` profile only. If the install fails, the wizard shows the error and goes on without it.
5. **Subscription notice.** If a chosen model uses an Anthropic subscription login, the wizard shows pi's notice: a Claude subscription used through pi draws from extra usage and is billed per token, not from your plan limits. Manage it at https://claude.ai/settings/usage.
6. **Finish.** The wizard writes the configuration file, reloads pi, then shows `Supervisor is on. Top tier: <model>.` with the doctor report below it (see [Doctor Checks](#doctor-checks)), preceded by the `pi-web-access` install result when that step ran. The status line reads `supervisor on · top <model>`.

Without the interactive TUI, `/supervisor-config` cannot run the wizard; write the configuration file by hand.

### Missing Credentials

With no usable model, the wizard prints:

```
No models with credentials. Log in with /login (for example a ChatGPT or Claude subscription) or set a provider key such as OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY, restart pi-supervisor, then run /supervisor-config again.
```

Nothing is written. Either run `/login` inside `pi-supervisor` (with the default link this also logs plain `pi` in), or export a provider key in your shell. Then restart `pi-supervisor` and run `/supervisor-config`.

If credentials go missing later, the status line shows it. When the `top` model has no credentials, the supervisor stays off and the status names `/supervisor-config doctor`. When another tier has none, the status adds `<tier> has no credentials`, the supervisor stays on, and a dispatch to an agent of that tier fails with an error that the supervisor reports.

### Configuration File

The wizard writes `<profile>/pi-supervisor.json` (`~/.config/pi-supervisor/pi-supervisor.json` by default); `/supervisor-config status` prints the path. You can edit it by hand:

```json
{
  "version": 1,
  "tiers": {
    "top": "openai-codex/<model id>",
    "strong": "openai-codex/<model id>",
    "standard": "openai-codex/<model id>",
    "fast": "openai-codex/<model id>"
  },
  "critic": null
}
```

- `version` must be `1`.
- Each tier is a `provider/id` string; `pi-supervisor --list-models` lists the valid ones. A pi thinking level may follow the id after a colon (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`), for example `"provider/id:high"`. The wizard never adds one and keeps the ones it finds.
- `critic` is `null` or a `provider/id` string.

After an edit, run `/reload` (or restart `pi-supervisor`), then `/supervisor-config doctor`. An invalid file turns the supervisor off, and the status line and the doctor name the problem.

### Changing Or Removing A Provider

Re-run `/supervisor-config` to change a tier: the proposal starts from your current configuration, so `Change <tier>` replaces one tier and keeps the others, and `Use another provider` proposes all four from another provider. To stop using a provider, `/logout` from it or unset its key, then remap the tiers that used it; until then the status line and the doctor name them.

A custom provider (one pi does not ship) is defined in the profile's own `models.json`, `<profile>/models.json`. Settings, packages and `models.json` are not shared with plain pi, so a custom provider you defined for plain pi must be defined there again to be usable here.

## Critic Model

An optional mode in which every `critic` dispatch runs on a model from another provider than the `top` tier, because a second model family catches different mistakes. Only the critic changes: `scope-critic` always uses its tier. Without a critic model, `critic` uses its tier (`strong`, or `top` for a top-tier plan).

### Cost And Data Flow

- The critic's provider bills its own usage, to the login or key it runs on.
- The content under review (the brief and the work the critic reads) is sent to that second provider.

### Switching

The wizard asks `Review with a model from another provider than the top tier? A second model family catches different mistakes.` when two or more providers have credentials, and lists `None: the critic agent uses its tier` and the other providers' models with their prices; on a re-run `Keep <current>` comes first. With one provider the step is skipped and a critic model already set is kept. To change or remove it, re-run `/supervisor-config`, or set `critic` in the configuration file to another `provider/id` or to `null`, then `/reload`. `/supervisor-config status` shows the current critic model, and the doctor checks that it exists and has credentials.

## Memory

```
/supervisor-memory externalize [--root DIR] [--name N]
/supervisor-memory link [DIR] [--root DIR] [--name N]
/supervisor-memory status
```

Use this to keep a local memory store outside the repo, shared by all its worktrees ([local-memory.md](local-memory.md)). Run it inside a git project. `externalize` moves the project's `.supervisor/` (or creates it) to `<root>/<name>/`, replaces it with a symlink, and lists it in `.git/info/exclude`. `link` attaches a checkout, a linked worktree or a fresh machine to an existing external directory, and `status` reads without writing and exits 1 with a repair hint. The root is `--root DIR`, else `$PI_SUPERVISOR_MEMORY_ROOT`, else `${XDG_DATA_HOME:-~/.local/share}/pi-supervisor/memory`. From a shell, the same verbs run as `python3 "$REPO/skills/project-memory/scripts/memory" <verb>`.

The script refuses a store that git tracks, a target inside a checkout of the same repo, and a link that already points elsewhere. Windows is not supported. Setup, git history for the memory, fresh machines, worktrees and moving back are covered there.

## Doctor Checks

`/supervisor-config doctor` prints one line per check (`PASS`, `WARN` or `FAIL`, the check and a detail) and a final count such as `0 FAIL, 1 WARN`. It needs no model call.

| Check | Level | Meaning and remedy |
|---|---|---|
| `pi version` >= 1.5.2 | FAIL | Run `pi update` |
| `node version` >= 22.19 | FAIL | Install a newer Node |
| `config` | FAIL | `pi-supervisor.json` is missing or invalid; run `/supervisor-config`, or fix the file |
| `tier <tier>` | FAIL | The model does not exist (`has no model of that name`) or has no credentials; `/login`, set the provider key, or remap the tier with `/supervisor-config` |
| `critic` (only when a critic model is set) | FAIL | As for a tier |
| `agents` | FAIL | The agent files do not load, or none is named `supervisor`; restore them in the clone |
| `web tools` | WARN | `web_search` and `fetch_content` are missing; run `/supervisor-config` to install `pi-web-access`, or `/reload` if it is installed but not yet active |
| `python3` | WARN | Not on `PATH`; the memory script needs it |
| `git` | WARN | Not on `PATH`; the git-ops and close-out work need it |
| `zip` | WARN | Not on `PATH`; `/project-backup` needs it |

The status line of the `pi-supervisor` session shows the supervisor state:

| Status line | Meaning |
|---|---|
| `supervisor on · top <model>` | On, on the `top` model; ` · <tier> has no credentials` is appended per tier without credentials |
| `supervisor off (/supervisor on)` | Turned off with `/supervisor off` for this session |
| `supervisor: not set up (/supervisor-config)` | No configuration file yet |
| `supervisor: invalid config: <problem> (/supervisor-config doctor)` | The configuration file is invalid; the supervisor stays off |
| `supervisor: agents/supervisor.md: <problem> (/supervisor-config doctor)` | The supervisor's agent file does not load |
| `supervisor: top model <model> is unknown (/supervisor-config doctor)` | The `top` model does not exist |
| `supervisor: top model <model> has no credentials (/supervisor-config doctor)` | The `top` model has no login or key |
| `supervisor: top model <model> could not be selected (/supervisor-config doctor)` | pi refused to switch to the `top` model |

## Uninstall

```bash
pi-supervisor uninstall
"$REPO/install" --uninstall          # the same, without the launcher
"$REPO/install" --uninstall --yes
```

Uninstall asks you to type `pi-supervisor` to confirm; `--yes` skips that, and a run that cannot read an answer needs it. It takes the prefix and the profile from the record, so no option is needed. It removes the launcher (only if install wrote it; otherwise it prints `kept <launcher> (not managed by pi-supervisor)`) and the whole profile directory, including the configuration, the sessions, a separate login and the web package. A linked `auth.json` is unlinked, not followed, so your pi logins stay. The record in the clone is removed too. Plain `pi` and any external memory store are left alone. The clone is yours to delete.

## Direct Install Into Plain Pi

The package can also be installed straight into plain pi's agent directory:

```bash
pi install "$REPO"
```

This is possible but not recommended, and the test suites do not cover it. The supervisor then takes over every plain `pi` session on the machine, since it is on by default wherever the package loads; `/supervisor off` switches it off one session at a time. The configuration file is then `~/.pi/agent/pi-supervisor.json`. Remove it with `pi remove "$REPO"`.

A project-local install (`pi install -l`) works only when the project is trusted in the profile that runs it. Otherwise pi ignores the project's packages, and the dispatched agents, which are separate pi processes, do not load the package.

## Routing Check

For contributors: the supervisor decides where each request goes from the routing rules in its instructions (`agents/supervisor.md`), so a reworded rule can silently change routing. A live routing test, which asks the supervisor to route canonical requests and compares its choices with the expected ones, has not run yet for Supervisor for Pi, and neither has the end-to-end validation against Supervisor for Claude. What exists runs without model calls:

```bash
python3 -m pytest -q    # install script, agent and skill lint (routing phrases in descriptions included), memory script
node --test             # extension logic, against a scripted provider
```

One live nested run is opt-in: `PI_SUPERVISOR_LIVE=1 node --test` installs into a temporary profile and prefix and calls real models, so it costs tokens. A plain `node --test` skips it.
