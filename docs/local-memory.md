# Keeping Memory Outside The Repo

A project's memory lives in `.supervisor/`. In a repo you cannot commit it to (open source, a shared team repo, a repo you do not own) it sits as local files in one checkout: invisible to git, gone with the clone, and not shared with your linked worktrees or your other machines. `/supervisor-memory` moves it into a directory outside the repo and leaves a symlink behind, so the store is the same live store everywhere it is linked, and you can put that directory under version control and sync it yourself.

You type `/supervisor-memory <verb>` inside `pi-supervisor`, which runs the `memory` script of the package in the session's directory. From a plain shell, run the script itself: `python3 /path/to/pi-supervisor/skills/project-memory/scripts/memory <verb>`, with the path of your clone of the package.

When you choose a local store, the answer ends with a hint to run `/supervisor-memory externalize`. The three examples below cover the three cases: moving the store out once, using it from a linked worktree, and using it on another machine. They assume a project checked out at `/home/you/src/proj` and the default external root.

## Example 1: Move The Store Out Of The Repo

Run this once, in the project's main checkout. Inside `pi-supervisor` started there, type:

```text
/supervisor-memory externalize
```

or from a shell:

```bash
cd /home/you/src/proj
python3 /path/to/pi-supervisor/skills/project-memory/scripts/memory externalize
```

```text
moved: /home/you/src/proj/.supervisor -> /home/you/.local/share/pi-supervisor/memory/proj/.supervisor
linked: /home/you/src/proj/.supervisor -> /home/you/.local/share/pi-supervisor/memory/proj/.supervisor
excluded: /.supervisor in /home/you/src/proj/.git/info/exclude
created README.md: /home/you/.local/share/pi-supervisor/memory/proj/README.md
ignored: .supervisor/working/residue/ in /home/you/.local/share/pi-supervisor/memory/proj/.gitignore
externalized: /home/you/.local/share/pi-supervisor/memory/proj
```

A `moved:` line means the project had a store; a `created:` line means it had none and the tool made an empty one. The project now holds a symlink, and git ignores it. The memory itself is in `~/.local/share/pi-supervisor/memory/proj/`.

To give the memory its own history, make that directory a repo:

```bash
cd ~/.local/share/pi-supervisor/memory && git init    # one repo for all projects
# or: cd ~/.local/share/pi-supervisor/memory/proj && git init    # one repo per project
```

The project name comes from the origin URL, else the folder name. Pass `--name` to choose another, and `--root` to use another external root:

```text
/supervisor-memory externalize --name proj --root ~/memory
```

## Example 2: Use It From A Linked Worktree

Worktrees the package creates get the link automatically. For a worktree you made yourself, run `link` inside it:

```bash
git worktree add ../proj-feature
cd ../proj-feature
python3 /path/to/pi-supervisor/skills/project-memory/scripts/memory link
```

```text
linked: /home/you/src/proj-feature/.supervisor -> /home/you/.local/share/pi-supervisor/memory/proj/.supervisor
linked: /home/you/.local/share/pi-supervisor/memory/proj
```

All worktrees share the one external store, so what an agent records in a worktree is there from the main checkout too. The exclude file is shared by the worktrees, so no new lines are needed.

## Example 3: Use It On Another Machine

Clone the memory repo and the project, then link:

```bash
git clone <memory repo> ~/.local/share/pi-supervisor/memory
git clone <project repo> ~/src/proj && cd ~/src/proj
python3 /path/to/pi-supervisor/skills/project-memory/scripts/memory link
```

```text
linked: /home/you/src/proj/.supervisor -> /home/you/.local/share/pi-supervisor/memory/proj/.supervisor
excluded: /.supervisor in /home/you/src/proj/.git/info/exclude
linked: /home/you/.local/share/pi-supervisor/memory/proj
```

If you cloned the memory repo somewhere else, or the project's name differs, pass `--root DIR`, `--name N`, or the project's memory directory itself: `/supervisor-memory link ~/memory/proj`.

## What `externalize` Does

The symlink is absolute. The exclude line goes in `.git/info/exclude`; the project's `.gitignore` is never touched. The `README.md` in `<root>/<name>/` says which project the directory belongs to and how to move it back. The `.gitignore` there keeps test leftovers (the residue ledger, see [workflow-lifecycle.md](workflow-lifecycle.md)) out of the memory history.

The external root is `$PI_SUPERVISOR_MEMORY_ROOT`, else `${XDG_DATA_HOME:-~/.local/share}/pi-supervisor/memory`; `--root` overrides both. It is data, not config, and lies outside the `pi-supervisor` profile, so it survives `./install --uninstall`.

`externalize` and `link` are safe to repeat: a second run only repairs what is missing. When either refuses, its message names the repair.

The script needs `python3` and uses only its standard library. Windows is not supported.

## Daily Flow

Nothing changes. Agents read and write `.supervisor/` as before; the files land in the external directory. Once that directory is a repo, the package commits memory changes there at close-out and after each wave of a large plan, as `chore(memory): ...` commits. It never pushes or pulls: add a remote and push when you choose.

## Status And Troubleshooting

`/supervisor-memory status` is a read-only check of the link and the exclude line. When something is off, the command shows its messages as an error and the script exits 1, and each message names its repair.

- **Dangling link:** the external directory moved or is missing (a fresh machine without the clone). Restore it, or remove the link and run `/supervisor-memory link`.
- **Missing exclude line:** rerun `externalize` or `link`; it adds the line.
- **Tracked store:** git tracks `.supervisor`. Untrack with `git rm -r --cached`, commit, then rerun.
- **Both exist:** the project has a real store and `<root>/<name>` has one too. Either a move was interrupted, or another project with the same default name already uses `<root>/<name>`. Look at `<root>/<name>/README.md`, which names the project it belongs to, before removing anything. For a name clash, keep both and re-run with `--name`.
- **Same-name projects:** two projects whose default names match share `<root>/<name>`. If the second project has a store, `externalize` stops with `both exist`. If it has none, `externalize` stops with a hint to run `/supervisor-memory link`; do not follow it, since that would attach this project to the other one's memory. In both cases re-run with `--name`.

## Moving Back

```bash
rm .supervisor                      # the symlink
mv <root>/<name>/.supervisor .
```

The exclude line can stay; it keeps the restored local store out of git.

## Sharing With A Team

The external directory is an ordinary git repo, so a team can share one memory repo and each member links their checkout to a clone of it. Nothing merges the store for you: agents write to it freely, so agree on who pushes and pull before starting.
