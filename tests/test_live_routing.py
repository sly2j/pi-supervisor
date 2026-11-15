"""Live routing check: ask the supervisor on pi to route the source's 28 canonical requests.

Opt-in, costs tokens: PI_SUPERVISOR_LIVE_ROUTING=1 (PI_SUPERVISOR_ROUTING_CASES=1,4,5,16 limits it).
Nothing is dispatched: the live-stop fixture blocks tool calls. Runs in a temporary profile on the
openai-codex login (or, only with PI_SUPERVISOR_ALLOW_API=1, an OpenAI API key). The cases are those of
claude-supervisor tests/test_live_routing.py, with D6 tier names for the expected models.
"""

import json
import os
import re
import subprocess
from pathlib import Path

import pytest

import live

ROOT = Path(__file__).resolve().parent.parent
GATE = os.environ.get("PI_SUPERVISOR_LIVE_ROUTING") == "1"
ROUTING_MODEL = "gpt-6-astra"  # the `top` model the wizard proposes on openai-codex (P6-D3)
CASE_CAP, RUN_CAP, PILOT_MEAN, CASE_TIMEOUT = 0.50, 6.0, 0.30, 300
MODELS = {"default", "top", "strong", "standard", "fast"}
WRAPPER = (
    "Routing check only: do not dispatch or call tools; answer from your routing rules; "
    "reply with exactly one line `MODE: <1|2|direct>; AGENT: <name|none>; MODEL: <top|strong|standard|fast|default>` "
    "(the `model` tier you would pass on the dispatch, `default` when you would pass none).\n\nRequest: "
)
CASES = [
    ("Fix the typo 'recieve' in README.md.", "2", "fixer", "default"),
    ("Commit the staged changes with the message 'docs: clarify install steps'.", "2", "git-ops", "default"),
    ("Which file in this repo defines the function parse_frontmatter?", "2", "scout", "default"),
    ("What is the difference between /new and /compact?", "direct", "none", "default"),
    ("Find out how deploy registers profiles and write it up.", "1", "researcher", "default"),
    ("Plan a `--json` flag for `deploy status`.", "1", "planner", "default"),
    ("Add a `--json` flag to `deploy status` with tests.", "1", "executor", "default"),
    ("Draft the overview section of our proposal from these notes: goals, budget, timeline.", "1", "writer", "default"),
    ("Rename the variable `cfg` to `config` across deploy, tests/test_deploy.py and docs/deploy.md.", "2", "fixer", "default"),
    ("The fixer reported: ESCALATE: the rename touches 12 files and two call sites change signature. "
     "What now?", "1", "executor", "default"),
    ("Push main to origin.", "2", "git-ops", "default"),
    ("Move the four profile-registry functions in deploy into a `ProfileRegistry` class with the same method names and update their three callers.", "1", "executor", "default"),
    ("Quick: fix the failing test in tests/test_deploy.py.", "2", "fixer", "default"),
    ("Change the default backup directory to ~/backups; existing users' backups will land there from now on.", "1", "executor", "default"),
    ("Plan how to add retry logic to the backup step of `deploy install`; I'm not sure whether a decorator "
     "or a loop fits better.", "1", "planner", "default"),
    ("Plan the move of all our services to a new auth provider: the gateway, billing, the web app and the CLI "
     "each need changes over the next quarter.", "1", "planner", "top"),
    ("Work out how the deploy tool's profile registry and the test harness's fixture loader should share state; I see a few approaches "
     "with real trade-offs and want a plan.", "1", "planner", "top"),
    ("Plan a port of the deploy tool to Windows; nobody here has done Windows packaging before.",
     "1", "planner", "top"),
    ("Plan a `--quiet` flag for `deploy status`, and be thorough about it.", "1", "planner", "top"),
    ("I left comments in .supervisor/plans/auth-migration.md (the quarter-long program moving the gateway, "
     "billing, web app and CLI to a new auth provider); work through my annotations and update the plan.",
     "1", "planner", "default"),
    ("Sync the checklist in .supervisor/plans/auth-migration.md (the quarter-long program moving the gateway, "
     "billing, web app and CLI to a new auth provider) with what has landed in git.",
     "1", "planner", "default"),
    ("Write a short email to the team saying the deploy window moves to Thursday.", "1", "writer", "strong"),
    ("Write the methods paragraph for our paper on the detector calibration from these notes.",
     "1", "writer", "default"),
    ("tests/test_deploy.py fails intermittently, only when run in parallel; track down the race and fix it.",
     "1", "executor", "strong"),
    ("Write a new agent definition for a security reviewer in pack/agents.", "1", "executor", "strong"),
    ("Split deploy into a package with cli.py, profiles.py and install.py along its existing sections; I haven't touched that code in years.",
     "1", "executor", "strong"),
    ("Why is `deploy install` slow on macOS? Investigate before we change anything.", "1", "researcher", "default"),
    ("`deploy status` crashes with `KeyError: 'profile'` at deploy:412 when no profile is registered. "
     "Fix it and add a regression test, with review.", "1", "executor", "default"),
]


def parse(text: str):
    m = re.search(r"MODE:\s*(1|2|direct);\s*AGENT:\s*(\S+?)[`.,;]*\s*;\s*MODEL:\s*`?(top|strong|standard|fast|default)", text or "")
    return (m.group(1), m.group(2).strip("`.,;"), m.group(3)) if m else None


def selected() -> set:
    raw = os.environ.get("PI_SUPERVISOR_ROUTING_CASES", "")
    return {int(x) for x in raw.split(",") if x.strip()} or set(range(1, len(CASES) + 1))


def stop_reason(seen: list):
    """Run-level hard stops: 6 USD for the run; a pilot mean above 0.30 after four cases."""
    total = sum(c for c in seen)
    if total >= RUN_CAP:
        return "run cap: %.2f USD spent" % total
    if len(seen) == 4 and total / 4 > PILOT_MEAN:
        return "pilot mean %.2f USD per case exceeds %.2f" % (total / 4, PILOT_MEAN)
    return None


def case_cap(seen: list) -> float:
    """The case cap, or what is left of the run cap when that is smaller."""
    return max(0.0, min(CASE_CAP, RUN_CAP - sum(seen)))


def test_routing_cases_valid():
    agents = {p.stem for p in (ROOT / "agents").glob("*.md")}
    assert len(CASES) == 28
    for text, mode, agent, model in CASES:
        assert model in MODELS, text
        assert agent in agents or (agent == "none" and mode == "direct"), text
        assert (agent == "none") == (mode == "direct"), text


def test_parse_line():
    assert parse("MODE: 2; AGENT: fixer; MODEL: default") == ("2", "fixer", "default")
    assert parse("`MODE: 1; AGENT: planner; MODEL: top`.") == ("1", "planner", "top")
    assert parse("MODE: direct; AGENT: none; MODEL: default") == ("direct", "none", "default")
    assert parse("no line") is None and parse("MODE: 1; AGENT: x; MODEL: opus") is None


def test_stop_reason():
    assert stop_reason([0.1] * 4) is None
    assert "pilot mean" in stop_reason([0.4, 0.3, 0.3, 0.3])
    assert "run cap" in stop_reason([0.4] * 15)
    assert case_cap([]) == 0.5 and abs(case_cap([5.9]) - 0.1) < 1e-9


SEEN: list = []  # cost per finished case, catalog USD
SCORE: list = []


@pytest.fixture(scope="module")
def profile():
    if not GATE:
        pytest.skip("live routing check: set PI_SUPERVISOR_LIVE_ROUTING=1 (costs tokens)")
    p = live.LiveProfile({t: "pending" for t in ("top", "strong", "standard", "fast")},
                         extra_packages=[live.STOP_FIXTURE])
    try:
        provider, route = p.route_check()
        if provider is None:
            pytest.skip(route)
        tier = "%s/%s" % (provider, ROUTING_MODEL)
        (p.profile / "pi-supervisor.json").write_text(
            json.dumps({"version": 1, "critic": None, "tiers": {t: tier for t in ("top", "strong", "standard", "fast")}}))
        p.require_models([ROUTING_MODEL])
        repo = p.tmp / "repo"
        repo.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
        p.repo = repo
        print("\nrouting route: %s" % route)
        yield p
    finally:
        print("\nrouting check: %d cases, %.4f USD (catalog), score %d/%d" % (
            len(SEEN), sum(SEEN), sum(SCORE), len(SCORE)))
        p.close()


@pytest.mark.parametrize("n", range(1, len(CASES) + 1))
def test_routing(profile, n):
    if n not in selected():
        pytest.skip("case not selected")
    stop = stop_reason(SEEN)
    assert stop is None, "stopped before case %d: %s" % (n, stop)
    request, mode, agent, model = CASES[n - 1]
    run = profile.run(WRAPPER + request, profile.repo, case_cap(SEEN), CASE_TIMEOUT)
    SEEN.append(run.usage.cost)
    got = parse(run.text)
    ok = got == (mode, agent, model) and run.turns <= 2 and not run.stopped
    SCORE.append(int(ok))
    calls = profile.stop_calls()
    profile.keep_evidence("routing-%02d" % n, {
        "case": n, "request": request, "expected": [mode, agent, model], "got": got, "text": run.text[-300:],
        "turns": run.turns, "tokens": [run.usage.input, run.usage.output], "cost": run.usage.cost,
        "stopped": run.stopped, "tool_attempts": [c["toolName"] for c in calls], "pass": ok})
    print("\ncase %d: %s expected %s got %s turns %d tokens %d/%d cost %.4f%s%s" % (
        n, "PASS" if ok else "FAIL", (mode, agent, model), got, run.turns, run.usage.input, run.usage.output,
        run.usage.cost, " STOPPED " + run.stopped if run.stopped else "",
        " tools %s" % [c["toolName"] for c in calls] if calls else ""))
    if profile.stop_log.exists():
        profile.stop_log.unlink()
    assert not run.stopped, "case stopped: %s" % run.stopped
    assert got == (mode, agent, model), "got %r from %r" % (got, run.text[-200:])
    assert run.turns <= 2, "turns %d" % run.turns
