# Setup

This page takes you from a clone to the first dispatched agent, and covers the configuration,
update and uninstall steps.

Supervisor for Pi is a pi package that runs through its own launcher, `pi-supervisor`. The
launcher runs `pi` with its own profile directory (`~/.config/pi-supervisor`), so the package
loads only there. Plain `pi` keeps its settings, packages and sessions. By default the two share
one login file; see [Logins](#logins).

## Requirements

- pi 1.5.2 or later, on your `PATH`
- Node 22.19 or later (the runtime pi itself uses; the doctor checks it)
- macOS or Linux with a POSIX shell. Windows is not supported.
- `git`, and access to the private repository `sly2j/pi-supervisor`
- `python3` for the memory script, and `bash` and `zip` for `/project-backup`. The doctor
  warns when `python3`, `git` or `zip` is missing.
- Credentials for at least one model provider: a pi login or a provider API key

## Install

The repository is private, so the clone needs your GitHub access.

```sh
git clone git@github.com:sly2j/pi-supervisor.git
cd pi-supervisor
./install
```

`./install` does four things:

1. It creates the profile directory `~/.config/pi-supervisor` (mode 0700).
2. It links the profile's `auth.json` to your pi logins ([Logins](#logins)).
3. It registers the clone in the profile with `pi install <clone>`. pi loads a local path in
   place, so keep the clone where it is.
4. It writes the launcher `~/.local/bin/pi-supervisor`, a shell script that sets
   `PI_CODING_AGENT_DIR` to the profile and runs `pi` with your arguments.

It then prints the profile, the login mode and the launcher path. It never edits your shell
startup files.

### PATH

If `~/.local/bin` is not on your `PATH`, the installer prints a `WARNING` with the line to add.
For the default prefix, add this to `~/.zshrc` or `~/.bashrc` and open a new terminal:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

### Install flags

| Flag | Effect |
|---|---|
| `--prefix DIR` | Write the launcher to `DIR/bin` (default `~/.local`) |
| `--profile DIR` | Use `DIR` as the profile (default `~/.config/pi-supervisor`) |
| `--separate-login` | Give the profile its own empty `auth.json` instead of the link |
| `--uninstall` | Remove the launcher and the profile ([Uninstall](#uninstall)) |
| `--yes` | With `--uninstall`, skip the confirmation |
| `-h`, `--help` | Print the usage text |

The installer stops without changing anything when:

- `pi` is not on your `PATH`;
- the profile would be a plain pi agent directory (`~/.pi/agent`, or the directory an exported
  `PI_CODING_AGENT_DIR` names), your home directory or `/`;
- a file that the installer did not write already exists at the launcher path;
- `--prefix` or `--profile` contains a `.` or `..` path component.

### Logins

pi keeps its logins in `auth.json` inside the agent directory, so a new profile would start
without any. The installer handles this in one of two ways.

- **Linked (default).** `~/.config/pi-supervisor/auth.json` is a symbolic link to the
  `auth.json` of your plain pi (`~/.pi/agent/auth.json`, or the one in an exported
  `PI_CODING_AGENT_DIR`). Your existing logins work at once and no secret is copied. The
  trade-off: a `/login` or `/logout` inside `pi-supervisor` also changes the logins of plain
  `pi`, and the reverse. If plain pi has no `auth.json` yet, the installer creates an empty one
  (mode 0600); that is the only file it writes outside the profile and the launcher.
- **Separate (`--separate-login`).** The profile gets its own empty `auth.json`. Run `/login`
  once inside `pi-supervisor`. Logins are then fully separate.

Switching modes is a re-run of `./install` with or without the flag. Switching from separate
back to linked deletes the profile's own `auth.json`, so its logins are lost. Pass
`--separate-login` on every later `./install` run to keep the separate mode.

Provider keys in environment variables (`OPENAI_API_KEY` and others) reach both `pi` and
`pi-supervisor` in either mode. Settings, installed packages and `models.json` are not shared:
a custom provider that you defined for plain pi must be defined again in
`~/.config/pi-supervisor/models.json` to be usable here.

## First start

```sh
pi-supervisor
```

The launcher passes every argument to `pi`, so pi's own options and subcommands work inside the
profile, for example `pi-supervisor -c` or `pi-supervisor list`.

On the first interactive start there is no configuration yet. A notice says "Supervisor for Pi
is not set up yet. Press Enter to choose its models." and the input line already holds
`/supervisor-config`. Press Enter to start the wizard. You can also type `/supervisor-config` at
any later time to change the setup.

## The tier wizard

Agents do not name models. Each agent has one of four tiers, and the wizard maps each tier to a
model of a provider you have credentials for.

| Tier | Agents |
|---|---|
| `top` | `supervisor` (your session), `writer`, `scope-critic` |
| `strong` | `planner`, `researcher`, `critic`, `writer-worker` |
| `standard` | `executor`, `curator`, `executor-worker`, `planner-worker`, `researcher-worker` |
| `fast` | `fixer`, `git-ops`, `scout` |

The wizard runs these steps. Cancelling at a selection list stops the wizard and writes no
configuration. Escape at a yes/no question counts as no.

1. **Models.** The wizard collects the models that have credentials. If there are none, it
   stops; see [Missing credentials](#missing-credentials).
2. **Proposal.** It shows one line per tier with the model, its price per million input and
   output tokens, and the agents that use it. On the first run the proposal takes the models of
   one provider (the provider of the session's current model, else the one with the most
   models), sorts them by price and spreads them over the four tiers, dearest first. With fewer
   than four models, neighbouring tiers share one, and the wizard says so. On a later run the
   proposal is your current configuration. Choose:
   - `Accept` to continue;
   - `Change top`, `Change strong`, `Change standard` or `Change fast` to pick any available
     model for that tier, from a list sorted dearest first;
   - `Use another provider` (shown when two or more providers have credentials) to get a new
     proposal from that provider;
   - `Cancel`.
3. **Critic model (optional).** Shown only when two or more providers have credentials. The
   wizard asks whether reviews should use a model from another provider than the `top` tier,
   because a second model family catches different mistakes. If you say yes, pick the model
   from the list. That model then runs every `critic` dispatch. If you say no, the `critic`
   uses its tier (`strong`). `scope-critic` always uses its tier.
4. **Web tools (optional).** Shown when the `web_search` and `fetch_content` tools are not
   present. The wizard offers to install the third-party package `pi-web-access`
   (`npm:pi-web-access`), which provides both. It is installed into the `pi-supervisor` profile
   only. If the install fails, the wizard shows the error and continues without it.
5. **Subscription notice.** If a chosen model uses an Anthropic subscription login, the wizard
   shows pi's notice: a Claude subscription used through pi draws from extra usage and is
   billed per token, not from your plan limits. Manage it at
   <https://claude.ai/settings/usage>.
6. **Finish.** The wizard writes the configuration file, shows the doctor report
   ([Doctor](#doctor)) and "Supervisor is on. Top tier: <model>.", and reloads pi.

After the reload the status line reads `supervisor on · top <model>`, and your session runs as
the supervisor: on the `top` model, with the supervisor's tool list (no `bash`) and its
instructions appended to pi's system prompt.

### Missing credentials

With no usable model, the wizard prints:

> No models with credentials. Log in with /login (for example a ChatGPT or Claude subscription)
> or set a provider key such as OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY, restart
> pi-supervisor, then run /supervisor-config again.

Nothing is written. Either run `/login` inside `pi-supervisor` (with the default link this also
logs plain `pi` in), or export a provider key in your shell. Then restart `pi-supervisor` and
run `/supervisor-config`.

If credentials go missing later, the status line shows it. When the `top` model has no
credentials, the supervisor stays off and the status names `/supervisor-config doctor`. When
another tier has none, the status adds `<tier> has no credentials`, the supervisor stays on,
and a dispatch to an agent of that tier fails with an error that the supervisor reports.

## First dispatch

Ask for something that needs an agent, for example:

```text
Where is the tier configuration loaded? Give me the file and function.
```

The supervisor answers trivial questions itself and sends everything else to an agent through
its `dispatch` tool; a lookup like this one normally goes to `scout`. Each dispatched agent is
a separate `pi` process in the same profile, on the model of its tier.
[workflow-lifecycle.md](workflow-lifecycle.md) describes what to expect from larger requests.

## Doctor

```text
/supervisor-config doctor
```

The doctor prints one line per check (`PASS`, `WARN` or `FAIL`, the check and a detail) and a
final count. It needs no model call.

| Check | Level when it fails |
|---|---|
| pi is 1.5.2 or later | `FAIL` |
| Node is 22.19 or later | `FAIL` |
| The configuration file exists and is valid | `FAIL` |
| Each tier's model, and the critic model if set, exists and has credentials | `FAIL` |
| The agent files load and include `supervisor` | `FAIL` |
| `web_search` and `fetch_content` are present | `WARN` |
| `python3`, `git` and `zip` are on `PATH` | `WARN` |

A failing model check names the fix: `/login`, set the provider key, or remap the tier with
`/supervisor-config`.

## Commands

All commands are typed inside `pi-supervisor`.

| Command | Effect |
|---|---|
| `/supervisor-config` | Run the tier wizard |
| `/supervisor-config status` | Show the configuration path, the four tiers with their agents, the critic model, the supervisor state and whether the web tools are active |
| `/supervisor-config doctor` | Run the readiness checks |
| `/supervisor` | Show the supervisor state |
| `/supervisor off` | Turn the supervisor off for this session and restore the model, thinking level and tools it replaced |
| `/supervisor on` | Turn it back on |
| `/close-out [retry]` | Close out the session's work: archive the finished plan, update memory |
| `/pick-up [plan path \| card...]` | Re-enter a plan or pick task cards in a new session |
| `/project-backup` | Zip the project into the backup directory |
| `/meeting-summary <transcript path> [notes]` | Write minutes from a transcript |
| `/supervisor-memory <externalize\|link\|status> [options]` | Manage a memory store kept outside the repo ([memory.md](memory.md)) |

`/supervisor off` lasts for the session, including after `/reload` and when the session is
resumed. A new session (`/new`, or a new start) begins with the supervisor on. With it off, the
session behaves as plain pi with the package's `dispatch` tool and commands still loaded.
Completing `/supervisor-config` turns the supervisor on again.

## Configuration file

The wizard writes `~/.config/pi-supervisor/pi-supervisor.json` (in the directory given to
`--profile`, if you used it). `/supervisor-config status` prints the path. You can edit the file
by hand:

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
- Each tier is a `provider/id` string. List the valid ones with `pi-supervisor --list-models`.
  A pi thinking level may follow the id after a colon (`off`, `minimal`, `low`, `medium`,
  `high`, `xhigh`, `max`), for example `"provider/id:high"`. The wizard never adds one and
  keeps the ones it finds.
- `critic` is `null` or a `provider/id` string.

After an edit, run `/reload` (or restart `pi-supervisor`), then `/supervisor-config doctor`. An
invalid file turns the supervisor off, and the status line and the doctor name the problem.

Without the interactive TUI, `/supervisor-config` cannot run the wizard; write the file by
hand.

### Sessions of dispatched agents

The sessions of dispatched agents are kept under
`~/.config/pi-supervisor/pi-supervisor/sessions/<session id>/` as a record of which agents ran.
Nothing prunes them; delete old directories there when they grow.

## Update

```sh
cd pi-supervisor
git pull
./install
```

Then restart `pi-supervisor`. Re-running `./install` is safe; pass the same `--prefix`,
`--profile` and `--separate-login` as before.

- `pi-supervisor update --extensions` updates the packages in the profile, which is how
  `pi-web-access` is updated.
- `pi update` updates the pi program itself, which plain `pi` and `pi-supervisor` share.

## Uninstall

```sh
./install --uninstall
```

The installer asks you to type `pi-supervisor` to confirm; `--yes` skips the question. Pass the
same `--prefix` and `--profile` you installed with. It removes the launcher (only if the
installer wrote it) and the whole profile directory, including the configuration, the sessions
and the web package. A linked `auth.json` is unlinked, not followed, so your pi logins stay.
Plain `pi` and any external memory store are left alone. The clone is yours to delete.

## Direct install into plain pi

The package can also be installed straight into plain pi's agent directory:

```sh
pi install /path/to/pi-supervisor
```

This is possible but not recommended, and the test suites do not cover it. The supervisor then
takes over every plain `pi` session on the machine, since it is on by default wherever the
package loads; `/supervisor off` switches it off one session at a time. The configuration file
is then `~/.pi/agent/pi-supervisor.json`. Remove it with `pi remove /path/to/pi-supervisor`.

A project-local install (`pi install -l`) works only when the project is trusted in the profile
that runs it. Otherwise pi ignores the project's packages, and the dispatched agents, which are
separate pi processes, do not load the package.
