"""Cross lint between agents, skills and docs: references resolve, preloads match the source."""

import re
import shutil
from pathlib import Path

import pytest

from test_agents_lint import names, split

ROOT = Path(__file__).resolve().parent.parent
# agent -> skills preloaded by the source, claude-supervisor 6a49e38 (research Q2 agents table)
SOURCE_PRELOADS = {
    "supervisor": [], "planner-worker": [], "critic": [], "scope-critic": [], "scout": [],
    "researcher": ["lead-loop", "residue"],
    "planner": ["lead-loop", "plan-writing", "repo-workflow"],
    "executor": ["lead-loop", "git-safety", "repo-workflow", "residue"],
    "writer": ["lead-loop", "project-memory"],
    "researcher-worker": ["residue"], "executor-worker": ["residue"],
    "writer-worker": ["project-memory"],
    "fixer": ["project-memory", "residue"],
    "git-ops": ["git-safety", "repo-workflow"],
    "curator": ["project-memory"],
}
# One row per capability of the parity record (research Q5 table, plus the --global row of the parent's map)
PARITY_ROWS = [
    "Supervisor as main thread", "Supervisor tool deny", "`Agent` dispatch", "15 agent definitions",
    "Child context (repo instructions, skill catalog)", "Per-agent tier", "Per-dispatch model override",
    "`effort: xhigh`", "Per-agent tool lists", "Tool names", "WebSearch, WebFetch", "17 skills",
    "Skill preloading", "`user-invocable`, `context: fork`, `argument-hint`",
    "`${CLAUDE_SKILL_DIR}`, `$ARGUMENTS`", "Slash skills", "AskUserQuestion",
    "Subagents cannot ask the user", "Lead loop", "Nesting depth 2", "Dispatch allowlist per lead",
    "Report contract", "`.supervisor/` store", "External store link", "Executor worktrees",
    "Commit attribution", "`permissions.allow`", "`permissions.additionalDirectories`",
    "codex-critic backend", "Four tiers and `--fable-is-opus`", "Provider profiles",
    "Installer `deploy`, launcher and separate profile", "`--global` install into the default profile",
    "`doctor`", "Lint tests", "Live routing test", "Transcript audit", "Background agents",
]
TOP = ("agents/", "skills/", "docs/", "extensions/", "tests/")
FILES = ("install", "package.json", "README.md", "LICENSE", "CLAUDE.md")


def agent_files(root=ROOT):
    return sorted((root / "agents").glob("*.md"))


def skills_of(path):
    return names(split(path)[0].get("skills"))


def agent_skill_refs(root=ROOT):
    return [(p.stem, s) for p in agent_files(root) for s in skills_of(p)
            if not (root / "skills" / s / "SKILL.md").is_file()]


def dispatch_targets(root=ROOT):
    missing = []
    for p in [*(root / "agents").glob("*.md"), *(root / "skills").rglob("*.md")]:
        for m in re.finditer(r'\bagent: ?"([^"<>]+)"', p.read_text(encoding="utf-8")):
            if not (root / "agents" / (m.group(1) + ".md")).is_file():
                missing.append((str(p.relative_to(root)), m.group(1)))
    return missing


def doc_paths(root=ROOT):
    """Repo paths named in backticks or links of README.md and docs/*.md that do not exist."""
    docs = [p for p in [root / "README.md", *sorted((root / "docs").glob("*.md"))] if p.is_file()]
    missing = []
    for doc in docs:
        text = doc.read_text(encoding="utf-8")
        spans = re.findall(r"`([^`\n]+)`", text) + re.findall(r"\]\(([^)#\s]+)\)", text)
        for span in spans:
            tok = span.split()[0].removeprefix("./").rstrip(".,:;)")
            if re.search(r"[<>*${}…]|\.\.\.|://", tok):
                continue
            if tok.startswith(TOP) or tok in FILES:
                if not (root / tok).exists() and not (doc.parent / tok).exists():
                    missing.append((doc.name, tok))
    return missing


def test_agent_skill_refs_exist():
    assert agent_skill_refs() == []


def test_agent_skill_refs_catch_missing(tmp_path):
    shutil.copytree(ROOT / "agents", tmp_path / "agents")
    shutil.copytree(ROOT / "skills", tmp_path / "skills")
    f = tmp_path / "agents" / "scout.md"
    f.write_text(f.read_text().replace("tier: fast", "tier: fast\nskills:\n  - nope-skill", 1))
    assert ("scout", "nope-skill") in agent_skill_refs(tmp_path)


@pytest.mark.parametrize("path", agent_files(), ids=lambda p: p.stem)
def test_preloads_match_source(path):
    assert sorted(skills_of(path)) == sorted(SOURCE_PRELOADS[path.stem])


def test_preload_table_covers_agents():
    assert {p.stem for p in agent_files()} == set(SOURCE_PRELOADS)


def test_dispatch_targets_exist():
    assert dispatch_targets() == []


def test_dispatch_targets_catch_missing(tmp_path):
    (tmp_path / "agents").mkdir()
    (tmp_path / "skills").mkdir()
    (tmp_path / "agents" / "lead.md").write_text('agent: "ghost"\nagent: "<worker>"\n')
    assert dispatch_targets(tmp_path) == [("agents/lead.md", "ghost")]


def test_docs_paths_exist():
    assert doc_paths() == []


def test_docs_paths_catch_missing(tmp_path):
    (tmp_path / "docs").mkdir()
    (tmp_path / "README.md").write_text("see `tests/nope.py` and `install`\n")
    assert doc_paths(tmp_path) == [("README.md", "tests/nope.py"), ("README.md", "install")]


def parity_first_cells(root=ROOT):
    path = root / "docs" / "parity.md"
    text = path.read_text(encoding="utf-8")
    m = re.search(r"^## 2\..*?\n(.*?)(?=^## 3\.)", text, re.S | re.M)
    assert m, "docs/parity.md has no section 2 before section 3"
    rows = [[c.strip() for c in line.strip().strip("|").split("|")]
            for line in m.group(1).splitlines() if line.startswith("|")]
    return [r for r in rows[2:]]  # drop header and separator


def test_parity_rows_complete():
    rows = parity_first_cells()
    assert [r[0] for r in rows] == PARITY_ROWS
    for r in rows:
        assert len(r) == 4 and all(r), "row %r has an empty cell" % r[0]
        assert r[1].split()[0].strip(":,") in {"carried", "adapted", "dropped", "not"}, r[0]
