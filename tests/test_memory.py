"""Behavior tests for the memory script (externalize, link, status), run as a subprocess against scratch repos."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REAL_SCRIPT = Path(__file__).resolve().parent.parent / "skills" / "project-memory" / "scripts" / "memory"
STUB_TEMPLATE = "# .supervisor\n\nstub store readme for tests\n"
MARKER = "<!-- pi-supervisor memory: rewritten on every run -->"

GIT = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
GIT_ENV = dict({k: os.environ[k] for k in ("PATH", "TMPDIR", "LANG", "LC_ALL") if k in os.environ},
               HOME=os.devnull, GIT_CONFIG_NOSYSTEM="1", **GIT)  # no inherited GIT_DIR or user config


def base_env(tmp_path: Path) -> dict:
    env = {k: os.environ[k] for k in ("PATH", "TMPDIR", "LANG", "LC_ALL") if k in os.environ}
    env.update(GIT)
    env["HOME"] = str(tmp_path / "home")
    env["XDG_DATA_HOME"] = str(tmp_path / "xdg")
    return env


def git(cwd: Path, *args: str) -> str:
    r = subprocess.run(["git", "-C", str(cwd)] + list(args), capture_output=True, text=True,
                       env=GIT_ENV, timeout=60, stdin=subprocess.DEVNULL)
    assert r.returncode == 0, "git %s: %s" % (args, r.stderr)
    return r.stdout


def git_rc(cwd: Path, *args: str) -> int:
    return subprocess.run(["git", "-C", str(cwd)] + list(args), capture_output=True, env=GIT_ENV,
                          stdin=subprocess.DEVNULL, timeout=60).returncode


@pytest.fixture
def script(tmp_path: Path) -> Path:
    """The script copied beside a stub template, so tests do not depend on the real template."""
    base = tmp_path / "skill"
    (base / "scripts").mkdir(parents=True)
    (base / "templates").mkdir()
    (base / "templates" / "store-readme.md").write_text(STUB_TEMPLATE)
    dst = base / "scripts" / "memory"
    shutil.copy(str(REAL_SCRIPT), str(dst))
    dst.chmod(0o755)
    return dst


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    r = tmp_path / "proj"
    r.mkdir()
    git(r, "init", "-q")
    git(r, "commit", "-q", "--allow-empty", "-m", "init")
    return r


@pytest.fixture
def root(tmp_path: Path) -> Path:
    return tmp_path / "mem"


def memory(tmp_path: Path, script: Path, cwd: Path, verb: str, *args: str, env=None):
    env_ = base_env(tmp_path)
    env_.update(env or {})
    cmd = [sys.executable, str(script), verb] + list(args)
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, env=env_, timeout=60,
                          stdin=subprocess.DEVNULL)


def store(repo: Path) -> None:
    (repo / ".supervisor").mkdir()
    (repo / ".supervisor" / "note.md").write_text("note\n")


def exclude_lines(repo: Path) -> list:
    p = Path(git(repo, "rev-parse", "--path-format=absolute", "--git-path", "info/exclude").strip())
    return p.read_text().splitlines() if p.exists() else []


def extern(tmp_path, script, repo, root, *args):
    r = memory(tmp_path, script, repo, "externalize", "--root", str(root), *args)
    assert r.returncode == 0, r.stdout + r.stderr
    return r


def test_externalize_moves_and_links(tmp_path, script, repo, root):
    store(repo)
    r = extern(tmp_path, script, repo, root)
    ext = root.resolve() / "proj"
    assert (repo / ".supervisor").is_symlink()
    assert os.readlink(str(repo / ".supervisor")) == str(ext / ".supervisor")
    assert git_rc(repo, "check-ignore", "-q", ".supervisor") == 0
    assert (ext / ".supervisor" / "note.md").read_text() == "note\n"
    assert git(repo, "status", "--porcelain") == ""
    assert "moved: " in r.stdout and "externalized: %s" % ext in r.stdout


def test_externalize_creates_new_store(tmp_path, script, repo, root):
    r = extern(tmp_path, script, repo, root)
    ext = root.resolve() / "proj"
    assert (ext / ".supervisor" / "README.md").read_text() == STUB_TEMPLATE
    assert (repo / ".supervisor").is_symlink()
    assert not (repo / "CLAUDE.local.md").exists() and not (ext / "CLAUDE.local.md").exists()
    assert (ext / "README.md").read_text().splitlines()[0] == MARKER
    assert "created: " in r.stdout and "linked: " in r.stdout


def test_externalize_name_from_origin(tmp_path, script, repo, root):
    git(repo, "remote", "add", "origin", "git@h:org/proj.git")
    extern(tmp_path, script, repo, root)
    assert (root / "proj" / ".supervisor").is_dir()
    # no origin: toplevel basename
    other = tmp_path / "other-checkout"
    other.mkdir()
    git(other, "init", "-q")
    extern(tmp_path, script, other, root)
    assert (root / "other-checkout" / ".supervisor").is_dir()
    # --name
    third = tmp_path / "third"
    third.mkdir()
    git(third, "init", "-q")
    extern(tmp_path, script, third, root, "--name", "x")
    assert (root / "x" / ".supervisor").is_dir()
    # bad names
    for bad in ("a/b", ".", ".."):
        r = memory(tmp_path, script, third, "externalize", "--root", str(root), "--name", bad)
        assert r.returncode == 2 and "invalid project name" in r.stderr and r.stderr.startswith("error: ")


def test_externalize_refuses_tracked_store(tmp_path, script, repo, root):
    store(repo)
    git(repo, "add", ".supervisor/note.md")
    git(repo, "commit", "-q", "-m", "track")
    r = memory(tmp_path, script, repo, "externalize", "--root", str(root))
    assert r.returncode == 2
    assert "git rm -r --cached .supervisor" in r.stderr
    assert (repo / ".supervisor").is_dir() and not (repo / ".supervisor").is_symlink()
    assert not root.exists()


def test_externalize_refuses_symlinked_project_dir(tmp_path, script, repo, root):
    root.mkdir()
    (root / "proj").symlink_to(repo / "mem")
    r = memory(tmp_path, script, repo, "externalize", "--root", str(root))
    assert r.returncode == 2 and "lies inside the checkout" in r.stderr
    assert not (repo / "mem").exists()


def test_externalize_refuses_existing_external(tmp_path, script, repo, root):
    (root / "proj" / ".supervisor").mkdir(parents=True)
    before = sorted(p.relative_to(root).as_posix() for p in root.rglob("*"))
    r = memory(tmp_path, script, repo, "externalize", "--root", str(root))
    assert r.returncode == 2
    assert "/supervisor-memory link" in r.stderr
    assert sorted(p.relative_to(root).as_posix() for p in root.rglob("*")) == before
    assert not (repo / ".supervisor").exists() and not (repo / ".supervisor").is_symlink()
    assert exclude_lines(repo) == [] or "/.supervisor" not in exclude_lines(repo)


def test_externalize_refuses_other_link(tmp_path, script, repo, root):
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    (repo / ".supervisor").symlink_to(elsewhere)
    r = memory(tmp_path, script, repo, "externalize", "--root", str(root))
    assert r.returncode == 2
    assert "is a link to %s, not to" % elsewhere in r.stderr
    assert os.readlink(str(repo / ".supervisor")) == str(elsewhere)
    assert not root.exists()


def test_externalize_refuses_inside_project(tmp_path, script, repo):
    r = memory(tmp_path, script, repo, "externalize", "--root", str(repo / "mem"))
    assert r.returncode == 2 and "lies inside the checkout" in r.stderr
    assert not (repo / "mem").exists() and not (repo / ".supervisor").is_symlink()
    wt = tmp_path / "wt"
    git(repo, "worktree", "add", "-q", str(wt), "-b", "side")
    r = memory(tmp_path, script, repo, "externalize", "--root", str(wt / "mem"))
    assert r.returncode == 2 and "lies inside the checkout" in r.stderr
    assert not (wt / "mem").exists()


def test_externalize_refuses_foreign_readme(tmp_path, script, repo, root):
    store(repo)
    (root / "proj").mkdir(parents=True)
    (root / "proj" / "README.md").write_text("mine\n")
    r = memory(tmp_path, script, repo, "externalize", "--root", str(root))
    assert r.returncode == 2 and "is not written by pi-supervisor" in r.stderr
    assert (root / "proj" / "README.md").read_text() == "mine\n"
    assert (repo / ".supervisor").is_dir() and not (repo / ".supervisor").is_symlink()


def test_externalize_in_linked_worktree(tmp_path, script, repo, root):
    wt = tmp_path / "wt"
    git(repo, "worktree", "add", "-q", str(wt), "-b", "side")
    r = memory(tmp_path, script, wt, "externalize", "--root", str(root))
    assert r.returncode == 2
    assert "externalize runs in the main checkout (%s)" % repo.resolve() in r.stderr
    assert not (wt / ".supervisor").exists()


def test_externalize_idempotent(tmp_path, script, repo, root):
    store(repo)
    extern(tmp_path, script, repo, root)
    r = extern(tmp_path, script, repo, root)
    assert "externalized: " in r.stdout
    lines = exclude_lines(repo)
    assert lines.count("/.supervisor") == 1
    gi = (root / "proj" / ".gitignore").read_text().splitlines()
    assert gi.count(".supervisor/working/residue/") == 1


def test_externalize_refreshes_old_readme(tmp_path, script, repo, root):
    extern(tmp_path, script, repo, root)
    readme = root.resolve() / "proj" / ".supervisor" / "README.md"
    readme.write_text("old text: add .supervisor/ to .gitignore\n")
    r = extern(tmp_path, script, repo, root)
    assert readme.read_text() == STUB_TEMPLATE
    assert "refreshed README" in r.stdout


def test_externalize_gitignore_before_git(tmp_path, script, repo, root):
    extern(tmp_path, script, repo, root)
    ext = root / "proj"
    git(root, "init", "-q")
    res = ext / ".supervisor" / "working" / "residue"
    res.mkdir(parents=True)
    (res / "a.md").write_text("x\n")
    assert "residue" not in git(root, "status", "--porcelain")
    extern(tmp_path, script, repo, root)
    assert (ext / ".gitignore").read_text().splitlines().count(".supervisor/working/residue/") == 1


def test_externalize_outside_git(tmp_path, script, root):
    plain = tmp_path / "plain"
    plain.mkdir()
    r = memory(tmp_path, script, plain, "externalize", "--root", str(root),
               env={"GIT_CEILING_DIRECTORIES": str(tmp_path)})
    assert r.returncode == 2 and "not a git repository" in r.stderr


def test_status_ok(tmp_path, script, repo, root):
    extern(tmp_path, script, repo, root)
    r = memory(tmp_path, script, repo, "status")
    assert r.returncode == 0, r.stdout + r.stderr
    assert r.stdout.startswith("ok: %s -> %s" % (repo.resolve(), root.resolve() / "proj"))


def test_status_dangling(tmp_path, script, repo, root):
    extern(tmp_path, script, repo, root)
    shutil.rmtree(str(root / "proj" / ".supervisor"))
    r = memory(tmp_path, script, repo, "status")
    assert r.returncode == 1
    assert ".supervisor: dangling link to" in r.stdout and "/supervisor-memory link" in r.stdout


def test_status_missing_exclude(tmp_path, script, repo, root):
    extern(tmp_path, script, repo, root)
    p = Path(git(repo, "rev-parse", "--path-format=absolute", "--git-path", "info/exclude").strip())
    p.write_text("")
    r = memory(tmp_path, script, repo, "status")
    assert r.returncode == 1
    assert "missing /.supervisor in info/exclude" in r.stdout


def test_link_fresh_machine(tmp_path, script, repo, root):
    ext = root.resolve() / "proj"
    (ext / ".supervisor").mkdir(parents=True)
    (ext / ".supervisor" / "k.md").write_text("k\n")
    r = memory(tmp_path, script, repo, "link", "--root", str(root))
    assert r.returncode == 0, r.stdout + r.stderr
    assert os.readlink(str(repo / ".supervisor")) == str(ext / ".supervisor")
    lines = exclude_lines(repo)
    assert "/.supervisor" in lines
    assert "linked: %s" % ext in r.stdout


def test_link_explicit_dir(tmp_path, script, repo, root):
    d = tmp_path / "somewhere" / "store"
    (d / ".supervisor").mkdir(parents=True)
    r = memory(tmp_path, script, repo, "link", "--root", str(root), "--name", "ignored", str(d))
    assert r.returncode == 0, r.stdout + r.stderr
    assert os.readlink(str(repo / ".supervisor")) == str(d.resolve() / ".supervisor")
    assert not root.exists()


def test_link_refuses_real_store(tmp_path, script, repo, root):
    store(repo)
    (root / "proj" / ".supervisor").mkdir(parents=True)
    r = memory(tmp_path, script, repo, "link", "--root", str(root))
    assert r.returncode == 2
    assert "is a real file in the project; run `/supervisor-memory externalize`" in r.stderr
    assert not (repo / ".supervisor").is_symlink()


def test_link_missing_external(tmp_path, script, repo, root):
    r = memory(tmp_path, script, repo, "link", "--root", str(root))
    assert r.returncode == 2
    assert "no external store at %s" % (root.resolve() / "proj") in r.stderr
    assert not (repo / ".supervisor").is_symlink()


def prepared_external(tmp_path, script, repo, root):
    """Externalize in `repo`, then return the external dir."""
    extern(tmp_path, script, repo, root)
    return root.resolve() / "proj"


def test_link_in_worktree(tmp_path, script, repo, root):
    ext = prepared_external(tmp_path, script, repo, root)
    wt = tmp_path / "wt"
    git(repo, "worktree", "add", "-q", str(wt), "-b", "side")
    r = memory(tmp_path, script, wt, "link", "--root", str(root))
    assert r.returncode == 0, r.stdout + r.stderr
    assert os.readlink(str(wt / ".supervisor")) == str(ext / ".supervisor")
    assert git(wt, "status", "--porcelain") == ""
    st = memory(tmp_path, script, wt, "status")
    assert st.returncode == 0, st.stdout + st.stderr
    git(repo, "worktree", "remove", str(wt))
    assert not wt.exists()


def test_link_repairs_partial(tmp_path, script, repo, root):
    ext = prepared_external(tmp_path, script, repo, root)
    (repo / ".supervisor").unlink()
    p = Path(git(repo, "rev-parse", "--path-format=absolute", "--git-path", "info/exclude").strip())
    p.write_text("")
    r = memory(tmp_path, script, repo, "link", "--root", str(root))
    assert r.returncode == 0, r.stdout + r.stderr
    assert os.readlink(str(repo / ".supervisor")) == str(ext / ".supervisor")
    lines = exclude_lines(repo)
    assert "/.supervisor" in lines


def test_link_refuses_other_link(tmp_path, script, repo, root):
    (root / "proj" / ".supervisor").mkdir(parents=True)
    (repo / ".supervisor").symlink_to(tmp_path / "nowhere")
    r = memory(tmp_path, script, repo, "link", "--root", str(root))
    assert r.returncode == 2
    assert "dangling), not to" in r.stderr and "remove the link, then re-run" in r.stderr
    assert os.readlink(str(repo / ".supervisor")) == str(tmp_path / "nowhere")


def test_default_root_from_env(tmp_path, script, repo):
    r = memory(tmp_path, script, repo, "externalize")
    assert r.returncode == 0, r.stderr
    assert (tmp_path / "xdg" / "pi-supervisor" / "memory" / "proj" / ".supervisor").is_dir()
    r = memory(tmp_path, script, repo, "externalize",
               env={"PI_SUPERVISOR_MEMORY_ROOT": str(tmp_path / "envroot")})
    assert r.returncode == 2  # the store lives under xdg: the link is "other" for envroot
    assert str(tmp_path / "envroot") in r.stderr


def test_externalize_requires_template(tmp_path, script, repo, root):
    (script.parent.parent / "templates" / "store-readme.md").unlink()
    r = memory(tmp_path, script, repo, "externalize", "--root", str(root))
    assert r.returncode == 2 and "store-readme.md is missing" in r.stderr
    assert not root.exists()
