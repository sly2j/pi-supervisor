"""Lint the real skills/ directory: frontmatter, caps, scripts, templates, relative references."""

import py_compile
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / "skills"
SKILL_DIRS = sorted(p for p in SKILLS.iterdir() if p.is_dir())
EXPECTED = {
    "agent-authoring", "close-out", "document-extraction", "email-extraction", "git-safety",
    "lead-loop", "meeting-summary", "pick-up", "plan-writing", "presentation-style",
    "project-backup", "project-memory", "python-env", "repo-workflow", "residue",
    "science-writing-style",
}
SKILL_WORD_CAP = 1380
MAX_LINE = 100
LEFTOVERS = [r"subagent_type", r"disallowedTools", r"CLAUDE_SKILL_DIR", r"codex",
             r"fable", r"opus", r"sonnet", r"haiku"]
SOURCE_ONLY = [r"CLAUDE\.local\.md", r"claude-supervisor", r"\.claude/", r"user-invocable",
               r"argument-hint", r"context: fork", r"\$ARGUMENTS", r"Supervisor for Claude", r"/clear\b"]


def frontmatter(path: Path) -> dict:
    lines = path.read_text(encoding="utf-8").splitlines()
    assert lines and lines[0] == "---", "%s: missing --- frontmatter" % path
    close = lines.index("---", 1)
    fm = {}
    for line in lines[1:close]:
        key, _, value = line.partition(":")
        fm[key.strip()] = value.strip()
    return fm


def body(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if lines and lines[0] == "---":
        close = lines.index("---", 1)
        return "\n".join(lines[close + 1:])
    return text


def text_files():
    for p in sorted(SKILLS.rglob("*")):
        if p.is_file() and p.name != ".DS_Store" and "__pycache__" not in p.parts:
            yield p


def test_expected_skills_ship():
    assert {p.name for p in SKILL_DIRS} == EXPECTED


@pytest.mark.parametrize("skill", SKILL_DIRS, ids=lambda p: p.name)
def test_skill_frontmatter_and_caps(skill):
    skill_md = skill / "SKILL.md"
    assert skill_md.is_file(), "missing SKILL.md"
    fm = frontmatter(skill_md)
    assert fm.get("name") == skill.name
    assert fm.get("description"), "empty description"
    assert len(fm["description"]) <= 1024
    n = len(skill_md.read_text(encoding="utf-8").splitlines())
    assert n <= 300, "SKILL.md has %d lines, cap is 300" % n
    words = len(body(skill_md).split())
    assert words <= SKILL_WORD_CAP, "SKILL.md body has %d words, cap is %d" % (words, SKILL_WORD_CAP)


SCRIPTS = [p for p in SKILLS.glob("*/scripts/*") if p.is_file() and p.name != ".DS_Store"
           and "__pycache__" not in p.parts and p.suffix != ".pyc"]


@pytest.mark.parametrize("path", SCRIPTS, ids=lambda p: str(p.relative_to(SKILLS)))
def test_scripts_executable(path, tmp_path):
    assert path.stat().st_mode & 0o111, "not executable"
    first = path.read_text(encoding="utf-8").splitlines()[0]
    assert first.startswith("#!"), "first line is not a shebang"
    if "python" in first:
        py_compile.compile(str(path), cfile=str(tmp_path / "out.pyc"), doraise=True)


def test_memory_templates():
    """The memory templates carry exactly the documented frontmatter keys."""
    templates = SKILLS / "project-memory" / "templates"
    entry = frontmatter(templates / "entry.md")
    assert set(entry) == {"domain", "summary", "affects", "verified", "source", "supersedes"}
    assert set(frontmatter(templates / "draft-state.md")) == {"file"}
    readme = templates / "store-readme.md"
    assert readme.is_file() and not readme.read_text(encoding="utf-8").startswith("---")
    task = templates / "task.md"
    card = frontmatter(task)
    assert set(card) == {"summary", "status", "owner", "since", "plan", "depends", "decisions"}
    assert card["status"] == "open"
    assert len(body(task).split()) <= 200


def test_curator_procedures_have_no_git_commit():
    path = SKILLS / "project-memory" / "references" / "curator-procedures.md"
    assert "git commit" not in path.read_text(encoding="utf-8")


def test_default_branch_syncs_with_origin():
    text = (SKILLS / "repo-workflow" / "SKILL.md").read_text(encoding="utf-8")
    assert "git fetch origin" in text and "pull --rebase" in text
    assert "`origin` first" in text, "must push to origin before other remotes"


def test_commit_trailer_is_pi():
    text = (SKILLS / "git-safety" / "SKILL.md").read_text(encoding="utf-8")
    assert "Co-Authored-By: Supervisor for Pi" in text


def test_residue_skill_caps():
    assert len(body(SKILLS / "residue" / "SKILL.md").split()) <= 350


def test_teardown_wired():
    for rel in ("residue", "close-out"):
        assert "teardown" in (SKILLS / rel / "SKILL.md").read_text(encoding="utf-8"), rel


def test_pickup_claims():
    text = (SKILLS / "pick-up" / "SKILL.md").read_text(encoding="utf-8")
    assert "chore(memory): claim" in text
    assert "one or more" in text
    assert "linked worktree" in text
    tasks = (SKILLS / "project-memory" / "references" / "tasks.md").read_text(encoding="utf-8")
    assert "claim <card>[, <card>]" in tasks
    assert "lists and claims there" in tasks


def test_no_source_leftovers():
    """No source tool, frontmatter or product names; tier names appear only as whole words D6 allows."""
    hits = []
    for p in text_files():
        try:
            text = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for pat in LEFTOVERS:
            flags = re.IGNORECASE
            rx = r"\b%s\b" % pat if pat in LEFTOVERS[4:] else pat
            hits += ["%s: %s" % (p.relative_to(ROOT), pat) for _ in re.finditer(rx, text, flags)][:1]
        for pat in SOURCE_ONLY:
            if re.search(pat, text):
                hits.append("%s: %s" % (p.relative_to(ROOT), pat))
    assert not hits, "\n".join(hits)


REL = re.compile(r"(?<![\w./<-])((?:references|scripts|templates)/[\w.-]+(?:/[\w.-]+)*\.[A-Za-z0-9]+)")


@pytest.mark.parametrize("path", [p for p in text_files() if p.suffix == ".md"],
                         ids=lambda p: str(p.relative_to(SKILLS)))
def test_relative_refs_exist(path):
    """Every references/, scripts/ or templates/ path a skill names exists in that skill."""
    skill = SKILLS / path.relative_to(SKILLS).parts[0]
    # a skill may also point into a sibling skill (project-memory names repo-workflow's reference)
    missing = [r for r in REL.findall(path.read_text(encoding="utf-8"))
               if not any((d / r).exists() for d in [skill] + SKILL_DIRS)]
    assert not missing, "%s names missing files: %s" % (path.relative_to(ROOT), missing)


@pytest.mark.parametrize("path", [p for p in text_files() if p.suffix == ".md"],
                         ids=lambda p: str(p.relative_to(SKILLS)))
def test_body_line_length(path):
    """Body lines stay within MAX_LINE; only table rows and fenced code lines are exempt."""
    lines = path.read_text(encoding="utf-8").splitlines()
    if lines and lines[0] == "---":
        close = lines.index("---", 1)
        lines = [""] * (close + 1) + lines[close + 1:]
    long, fenced = [], False
    for n, line in enumerate(lines, 1):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            fenced = not fenced
        elif not fenced and not stripped.startswith("|") and len(line) > MAX_LINE:
            long.append("%s:%d (%d)" % (path.relative_to(ROOT), n, len(line)))
    assert not long, "lines over %d chars:\n%s" % (MAX_LINE, "\n".join(long))
