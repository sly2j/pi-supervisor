"""Token-free tests of tests/live.py: route choice, cost monitor, stop fixture, evidence handling."""

import json
import os
import subprocess
import time
from pathlib import Path

import pytest

import live

ROOT = Path(__file__).resolve().parent.parent
SCRIPTED = ROOT / "tests" / "fixtures" / "scripted-provider"
needs_pi = pytest.mark.skipif(subprocess.run(["sh", "-c", "command -v pi"], capture_output=True).returncode != 0,
                              reason="pi not on PATH")


def test_route_skip():
    provider, reason = live.choose_route({"status": "missing"}, {})
    assert provider is None and "not ready" in reason and "ALLOW_API" in reason
    assert live.choose_route({"status": "ready", "authType": "oauth"}, {})[0] == "openai-codex"
    assert live.choose_route({"status": "missing"}, {"PI_SUPERVISOR_ALLOW_API": "1"})[0] == "openai"


def test_missing_models():
    listing = "openai-codex  gpt-6-astra  400K\nopenai-codex  gpt-6-luna  400K\n"
    assert live.missing_models(listing, ["gpt-6-astra", "gpt-6-luna"]) == []
    assert live.missing_models(listing, ["gpt-6", "gpt-5.6-terra"]) == ["gpt-6", "gpt-5.6-terra"]


def test_cost_monitor_kills(tmp_path):
    entry = {"type": "message", "message": {"role": "assistant", "usage": {"input": 5, "output": 5, "cost": {"total": 1}}}}
    (tmp_path / "s.jsonl").write_text(json.dumps(entry) + "\n")
    assert live.usage_of(tmp_path).cost == 1
    proc = subprocess.Popen(["sleep", "30"], start_new_session=True)
    t = time.monotonic()
    assert live.watch(proc, [tmp_path], 0.5, 60, interval=0.2) == "cost cap"
    assert time.monotonic() - t < 10 and proc.poll() is not None


def test_wall_timeout_kills(tmp_path):
    proc = subprocess.Popen(["sleep", "30"], start_new_session=True)
    assert live.watch(proc, [tmp_path], 99, 0.5, interval=0.2) == "timeout"
    assert proc.poll() is not None


def test_monitor_leaves_finished_process(tmp_path):
    proc = subprocess.Popen(["true"], start_new_session=True)
    assert live.watch(proc, [tmp_path], 0.5, 60, interval=0.2) is None


@needs_pi
def test_stop_fixture_blocks(tmp_path, monkeypatch):
    """Scripted provider, no tokens: a dispatch call is blocked and logged; no child session exists."""
    evidence = tmp_path / "evidence"
    monkeypatch.setenv("PI_SUPERVISOR_EVIDENCE", str(evidence))
    scripted = {t: "scripted/" + t for t in ("top", "strong", "standard", "fast")}
    with live.LiveProfile(scripted, extra_packages=[live.STOP_FIXTURE, SCRIPTED], separate_login=True,
                          env_extra={"PI_OFFLINE": "1"}) as p:
        repo = p.tmp / "repo"
        repo.mkdir()
        task = {"dispatch": {"tasks": [{"agent": "fixer", "task": "x"}]}, "then": "done"}
        run = p.run("Task: " + json.dumps(task), repo, 1.0, 90, interval=0.5, model="scripted/top")
        assert run.stopped is None and run.code == 0, run.stderr
        calls = p.stop_calls()
        assert [c["toolName"] for c in calls] == ["dispatch"], run.stderr
        assert calls[0]["input"]["tasks"][0]["agent"] == "fixer"
        assert run.turns == 2 and run.text.startswith("done")
        assert p.child_sessions() == []
        dest = p.keep_evidence("stop-test", {"turns": run.turns})
        assert (dest / "summary.json").is_file() and (dest / "stop.log").is_file()
        names = {f.name for f in dest.rglob("*")}
        assert not names & {"auth.json", "settings.json"}
        assert (dest.parent == evidence)
        tmp = p.tmp
    assert not tmp.exists(), "temporary profile removed"


def test_evidence_off_without_env(monkeypatch):
    monkeypatch.delenv("PI_SUPERVISOR_EVIDENCE", raising=False)
    p = live.LiveProfile.__new__(live.LiveProfile)
    assert p.keep_evidence("x", {}) is None


def test_monitor_kills_survivors_and_catches_missed_cap(tmp_path):
    # a leader that exits on SIGTERM while its child ignores it: SIGKILL must still reach the child
    pidfile = tmp_path / "pid"
    script = "sh -c 'trap \"\" TERM; echo $$ > %s; exec sleep 30' & wait" % pidfile
    proc = subprocess.Popen(["sh", "-c", script], start_new_session=True)
    time.sleep(0.5)
    live.kill_group(proc, grace=0.5)
    pid = int(pidfile.read_text())
    time.sleep(0.3)
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)
    # a run that crossed the cap and ended between two polls still reports it
    entry = {"type": "message", "message": {"role": "assistant", "usage": {"cost": {"total": 2}}}}
    (tmp_path / "s.jsonl").write_text(json.dumps(entry) + "\n")
    done = subprocess.Popen(["true"], start_new_session=True)
    done.wait()
    assert live.watch(done, [tmp_path], 0.5, 60, interval=0.2) == "cost cap"
