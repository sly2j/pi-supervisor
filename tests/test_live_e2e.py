"""Live end-to-end runs through real leads: opt-in, costs tokens (PI_SUPERVISOR_LIVE_E2E=1).

Two runs in a temporary git repo copied from tests/fixtures/e2e-repo, on the four wizard tiers of the
openai-codex catalog (P6-D8); `-k e2e_mode2` runs one. Caps: Mode 1 5 USD, Mode 2 1 USD (catalog USD).
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

import live
from test_agents_lint import split

ROOT = Path(__file__).resolve().parent.parent
GATE = os.environ.get("PI_SUPERVISOR_LIVE_E2E") == "1"
TIER_IDS = {"top": "gpt-6-astra", "strong": "gpt-5.6-terra", "standard": "gpt-6.1-terra", "fast": "gpt-6-luna"}
TIMEOUT = 1200
MODE1 = ("Research two questions and write them up as one research file: how registry.py registers plugins, "
         "and how loader.py finds them. Review: light.")
MODE2 = "Fix the typo 'recieve' in README.md."


def agent_tier(name: str) -> str:
    return split(ROOT / "agents" / (name + ".md"))[0]["tier"]


def dispatched(session_file) -> bool:
    for e in live.entries(session_file):
        m = e.get("message") or {}
        if e.get("type") == "message" and m.get("role") == "assistant":
            if any(b.get("type") == "toolCall" and b.get("name") == "dispatch" for b in m.get("content") or []):
                return True
    return False


@pytest.fixture
def box():
    if not GATE:
        pytest.skip("live end-to-end: set PI_SUPERVISOR_LIVE_E2E=1 (costs tokens)")
    p = live.LiveProfile({})
    try:
        provider, route = p.route_check()
        if provider is None:
            pytest.skip(route)
        tiers = {t: "%s/%s" % (provider, i) for t, i in TIER_IDS.items()}
        (p.profile / "pi-supervisor.json").write_text(json.dumps({"version": 1, "tiers": tiers, "critic": None}))
        p.require_models(list(TIER_IDS.values()))
        p.tiers = tiers
        repo = p.tmp / "repo"
        shutil.copytree(ROOT / "tests" / "fixtures" / "e2e-repo", repo)
        (repo / ".supervisor").mkdir()
        shutil.copy2(ROOT / "skills" / "project-memory" / "templates" / "store-readme.md",
                     repo / ".supervisor" / "README.md")
        for cmd in (["init", "-q"], ["add", "-A"], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]):
            subprocess.run(["git", *cmd], cwd=repo, check=True, capture_output=True)
        p.repo = repo
        print("\ne2e route: %s" % route)
        yield p
    finally:
        p.close()


def check_run(run):
    assert not run.stopped, "stopped: %s (%s)" % (run.stopped, run.stderr[-300:])
    assert run.code == 0 and not run.error, "main failed: code %s, %s, %s" % (run.code, run.error, run.stderr[-300:])


def report(p, name, run, children):
    total = live.usage_of(p.main_dir, p.profile / "pi-supervisor" / "sessions")
    summary = {"tokens": [total.input, total.output], "cost": total.cost, "stopped": run.stopped,
               "main_turns": run.turns, "children": [{k: v for k, v in c.items() if k != "file"} for c in children]}
    dest = p.keep_evidence(name, summary)
    print("\n%s: tokens %d/%d cost %.4f USD; children %s; evidence %s" % (
        name, total.input, total.output, total.cost,
        [(c["agent"], c["model"]) for c in children], dest))


def test_e2e_mode1(box):
    p = box
    run = p.run(MODE1, p.repo, 5.0, TIMEOUT)
    kids = p.child_sessions()
    report(p, "e2e_mode1", run, kids)
    check_run(run)
    agents = [k["agent"] for k in kids]
    for need in ("researcher", "researcher-worker", "critic"):
        assert need in agents, "no %s child; children: %s" % (need, agents)
    for k in kids:
        assert k["agent"], "child of unknown agent: %s" % k["file"]
        assert k["model"] == p.tiers[agent_tier(k["agent"])], (k["agent"], k["model"])
        if k["agent"].endswith("-worker") or k["agent"] == "critic":
            assert not dispatched(k["file"]), "%s dispatched (depth)" % k["agent"]
    files = list((p.repo / ".supervisor" / "working" / "research").glob("research-*.md"))
    assert files, "no research file"
    body = "\n".join(f.read_text() for f in files)
    assert "registry.py" in body and "loader.py" in body
    fixture = (ROOT / "tests" / "fixtures" / "e2e-repo" / "README.md").read_text()
    assert (p.repo / "README.md").read_text() == fixture, "README.md changed"


def test_e2e_mode2(box):
    p = box
    run = p.run(MODE2, p.repo, 1.0, TIMEOUT)
    kids = p.child_sessions()
    report(p, "e2e_mode2", run, kids)
    check_run(run)
    assert "receive" in (p.repo / "README.md").read_text() and "recieve" not in (p.repo / "README.md").read_text()
    assert [k["agent"] for k in kids] == ["fixer"], [k["agent"] for k in kids]
    assert kids[0]["model"] == p.tiers["fast"]
    assert "xhigh" in kids[0]["thinking"], kids[0]["thinking"]
