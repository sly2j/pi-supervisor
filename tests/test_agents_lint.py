"""Lint agents/: frontmatter, tier table, tool lists, dispatch relationships, source leftovers."""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
AGENTS = sorted((ROOT / "agents").glob("*.md"))

TIERS = {"top", "strong", "standard", "fast"}
THINKING = {"off", "minimal", "low", "medium", "high", "xhigh", "max"}
KEYS = {"name", "description", "tier", "thinking", "tools", "excludeTools", "skills"}
# agent -> (tier, thinking, body class); the Tiers table of the source, with D6 names
TIER_TABLE = {
    "supervisor": ("top", None, "Main"),
    "researcher": ("strong", None, "Lead"), "executor": ("standard", None, "Lead"),
    "planner": ("strong", None, "Lead"), "writer": ("top", None, "Lead"),
    "researcher-worker": ("standard", None, "Worker"), "planner-worker": ("standard", None, "Worker"),
    "executor-worker": ("standard", None, "Worker"), "writer-worker": ("strong", None, "Worker"),
    "critic": ("strong", None, "Review"), "scope-critic": ("top", None, "Review"),
    "curator": ("standard", None, "Memory"),
    "fixer": ("fast", "xhigh", "Quick"), "git-ops": ("fast", "xhigh", "Quick"),
    "scout": ("fast", "xhigh", "Quick"),
}
BODY_WORD_CAPS = {"Main": 1000, "Lead": 700, "Review": 600, "Worker": 400, "Memory": 400, "Quick": 350}
PI_TOOLS = {"read", "bash", "edit", "write", "grep", "find", "ls", "dispatch", "web_search", "fetch_content"}
LEAD_WORKERS = {
    "executor": ["executor-worker"], "researcher": ["researcher-worker"],
    "planner": ["planner-worker"], "writer": ["writer-worker"],
}
LEAVES = {n for n in TIER_TABLE if n.endswith("-worker")} | {
    "critic", "scope-critic", "fixer", "git-ops", "scout", "curator"}
# agent -> (tools it must list, tools it must not list)
TIER_TOOLS = {
    "supervisor": (["dispatch"], ["bash"]),
    "critic": (["bash", "read"], ["write", "edit"]),
    "scope-critic": (["read"], ["bash", "write", "edit"]),
    "planner-worker": (["bash"], ["write", "edit"]),
    "researcher-worker": (["web_search", "fetch_content"], ["edit"]),
    "scout": (["grep", "find", "ls"], ["write", "edit"]),
    "curator": (["grep", "find", "ls", "bash", "edit", "write"], []),
    "fixer": (["grep", "find", "ls", "bash", "edit", "write"], []),
    "git-ops": (["bash", "grep", "find", "ls"], ["edit", "write"]),
    **{lead: (["dispatch", "grep", "find", "ls"], []) for lead in LEAD_WORKERS},
}
ROUTING_SCOPE = {  # agent -> phrases its description must keep, so routing lives on the descriptions
    "researcher": ["investigat", "code tracing", "literature/web research", "research artifact"],
    "planner": ["decision-and-outline plan", "plan annotation cycles", "checklist sync"],
    "executor": ["code", "script", "test", "config", "refactors", "agent and skill definitions",
                 "git conflicts", "Python environments"],
    "writer": ["scientific documents", "proposals", "reports", "presentation content", "emails",
               "project docs"],
    "fixer": ["small, fully specified edits", "running a given command or script",
              "reporting its output", "task-card status"],
    "git-ops": ["status", "diff", "log", "commit", "branch", "push", "pull", "stash", "tag"],
    "scout": ["read-only", "quick lookups", "task cards"],
}
SOURCE_LEFTOVERS = ["subagent_type", "disallowedTools", "CLAUDE_SKILL_DIR", "codex",
                    "fable", "opus", "sonnet", "haiku",
                    "WebSearch", "WebFetch", "Glob", "AskUserQuestion", "NotebookEdit",
                    "harness attribution", "Supervisor for Claude", r"\.claude/", r"Agent\(", r"/clear\b"]
MAX_LINE = 100


def split(path: Path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"---\n(.*?)\n---\n(.*)$", text, re.S)
    assert m, "%s: missing --- frontmatter" % path
    fm, key = {}, None
    for line in m.group(1).splitlines():
        item = re.match(r"\s+-\s+(.*)$", line)
        if item:
            fm[key].append(item.group(1).strip())
            continue
        kv = re.match(r"([\w-]+):\s*(.*)$", line)
        assert kv, "%s: bad frontmatter line %r" % (path.name, line)
        key, val = kv.group(1), kv.group(2).strip()
        fm[key] = [] if val == "" else val
    return fm, m.group(2)


def names(value) -> list:
    if isinstance(value, list):
        return value
    return [t.strip() for t in str(value or "").split(",") if t.strip()]


def test_all_agents_present():
    assert {p.stem for p in AGENTS} == set(TIER_TABLE)


@pytest.mark.parametrize("path", AGENTS, ids=lambda p: p.stem)
def test_agent_frontmatter(path):
    fm, _ = split(path)
    assert fm.get("name") == path.stem
    desc = str(fm.get("description") or "")
    assert desc.strip(), "description empty"
    assert ": " not in desc and " #" not in desc, "description is not a safe plain YAML scalar"
    assert not set(fm) - KEYS, "unknown keys %s (pi loads them silently)" % sorted(set(fm) - KEYS)
    if "thinking" in fm:
        assert fm["thinking"] in THINKING
    assert not ("tools" in fm and "excludeTools" in fm)
    for field in ("tools", "excludeTools"):
        bad = set(names(fm.get(field))) - PI_TOOLS
        assert not bad, "%s: not pi tool names: %s" % (field, sorted(bad))


@pytest.mark.parametrize("path", AGENTS, ids=lambda p: p.stem)
def test_agent_matches_tier_table(path):
    fm, _ = split(path)
    tier, thinking, _cls = TIER_TABLE[path.stem]
    assert fm.get("tier") in TIERS
    assert (fm.get("tier"), fm.get("thinking")) == (tier, thinking)


@pytest.mark.parametrize("name", sorted(TIER_TOOLS))
def test_agent_matches_tier_tools(name):
    fm, _ = split(ROOT / "agents" / (name + ".md"))
    have = set(names(fm.get("tools")))
    assert have, "%s must use a tools allowlist" % name
    must, mustnt = TIER_TOOLS[name]
    assert not set(must) - have, "%s must list %s" % (name, sorted(set(must) - have))
    assert not set(mustnt) & have, "%s must not list %s" % (name, sorted(set(mustnt) & have))
    assert not have & {"grep", "find", "ls"} or {"grep", "find", "ls"} <= have, \
        "%s lists some of grep, find, ls but not all" % name


@pytest.mark.parametrize("path", AGENTS, ids=lambda p: p.stem)
def test_agent_body_word_cap(path):
    _, body = split(path)
    cls = TIER_TABLE[path.stem][2]
    n = len(body.split())
    assert n <= BODY_WORD_CAPS[cls], "%s: %d words, %s cap is %d" % (
        path.stem, n, cls, BODY_WORD_CAPS[cls])


@pytest.mark.parametrize("path", AGENTS, ids=lambda p: p.stem)
def test_leaves_exclude_dispatch(path):
    if path.stem not in LEAVES:
        pytest.skip("not a leaf agent")
    fm, _ = split(path)
    if "tools" in fm:
        assert "dispatch" not in names(fm["tools"])
    else:
        assert "dispatch" in names(fm.get("excludeTools")), "%s can dispatch" % path.stem


@pytest.mark.parametrize("lead", sorted(LEAD_WORKERS))
def test_leads_dispatch_only_own_workers(lead):
    text = (ROOT / "agents" / (lead + ".md")).read_text(encoding="utf-8")
    called = set(re.findall(r'agent: "([^"]+)"', text))
    assert set(LEAD_WORKERS[lead]) <= called, "%s must dispatch %s" % (lead, LEAD_WORKERS[lead])
    extra = called - set(LEAD_WORKERS[lead]) - {"critic", "scope-critic"}
    assert not extra, "%s must not dispatch %s" % (lead, sorted(extra))


@pytest.mark.parametrize("agent", sorted(ROUTING_SCOPE))
def test_routing_scope_in_description(agent):
    fm, _ = split(ROOT / "agents" / (agent + ".md"))
    desc = fm["description"].lower()
    missing = [p for p in ROUTING_SCOPE[agent] if p.lower() not in desc]
    assert not missing, "%s description lacks %s" % (agent, missing)


def test_supervisor_names_routed_agents():
    text = (ROOT / "agents" / "supervisor.md").read_text(encoding="utf-8")
    missing = [a for a in ROUTING_SCOPE if "`%s`" % a not in text]
    assert not missing, "supervisor does not name %s" % missing


@pytest.mark.parametrize("name", ["curator", "fixer"])
def test_memory_agents_never_commit(name):
    text = (ROOT / "agents" / ("%s.md" % name)).read_text(encoding="utf-8")
    assert "git commit" not in text, "%s must not run git commit; git-ops commits" % name
    assert "never commit" in text.lower(), "%s must state it never commits" % name


@pytest.mark.parametrize("path", AGENTS, ids=lambda p: p.stem)
def test_body_line_length(path):
    _, body = split(path)
    long, fenced = [], False
    for n, line in enumerate(body.splitlines(), 1):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            fenced = not fenced
        elif not fenced and not stripped.startswith("|") and len(line) > MAX_LINE:
            long.append("%d (%d)" % (n, len(line)))
    assert not long, "%s: body lines over %d chars: %s" % (path.name, MAX_LINE, long)


@pytest.mark.parametrize("path", AGENTS, ids=lambda p: p.stem)
def test_no_source_leftovers(path):
    text = path.read_text(encoding="utf-8")
    found = [w for w in SOURCE_LEFTOVERS if re.search(w if "\\" in w else r"\b%s\b" % w, text, re.I)]
    assert not found, "%s still has source terms %s" % (path.name, found)


def skills_of(name):
    return split(ROOT / "agents" / ("%s.md" % name))[0].get("skills") or []


def test_git_ops_loads_git_safety():
    assert {"git-safety", "repo-workflow"} <= set(skills_of("git-ops"))


@pytest.mark.parametrize("name", ["executor", "executor-worker", "researcher",
                                  "researcher-worker", "fixer"])
def test_residue_skill_preloaded(name):
    assert "residue" in skills_of(name)


@pytest.mark.parametrize("name", ["supervisor", "fixer"])
def test_teardown_wired(name):
    assert "teardown" in (ROOT / "agents" / ("%s.md" % name)).read_text(encoding="utf-8")


def test_curator_task_briefs():
    text = (ROOT / "agents" / "curator.md").read_text(encoding="utf-8")
    scope = text.split("## Scope", 1)[1].split("\n## ", 1)[0]
    assert "task <text>" in scope and "drop task" in scope


def test_git_ops_syncs_with_origin():
    text = (ROOT / "agents" / "git-ops.md").read_text(encoding="utf-8")
    assert "git fetch origin" in text and "pull --rebase" in text and "`origin` first" in text
