"""Helpers for the opt-in live tests: temporary profile, route check, cost monitor, evidence.

Not collected by pytest. A live run installs the repo into a temporary profile and prefix made by
./install, runs the launcher there, and removes both in `close`. The monitor kills a run that goes
over a catalog-USD cap or a wall timeout. Nothing here reads or copies auth.json or settings.json.
"""

import json
import os
import re
import shutil
import signal
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STOP_FIXTURE = ROOT / "tests" / "fixtures" / "live-stop"
CODEX = "openai-codex"


@dataclass
class Usage:
    input: int = 0
    output: int = 0
    cost: float = 0.0
    turns: int = 0


def session_files(*dirs) -> list:
    return sorted(f for d in dirs if Path(d).is_dir() for f in Path(d).rglob("*.jsonl"))


def entries(path) -> list:
    out = []
    for line in Path(path).read_bytes().split(b"\n"):
        try:
            out.append(json.loads(line))
        except ValueError:
            pass  # empty or a half-written last line
    return out


def usage_of(*dirs) -> Usage:
    """Sum assistant usage over every session file under the directories (pi writes it per message)."""
    u = Usage()
    for f in session_files(*dirs):
        v = _usage_file(entries(f))
        u.input, u.output, u.cost, u.turns = u.input + v.input, u.output + v.output, u.cost + v.cost, u.turns + v.turns
    return u


def kill_group(proc, grace: float = 5.0) -> None:
    """SIGTERM the process group, then SIGKILL it after the grace period even if the leader is gone."""
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        proc.wait(grace)
    except subprocess.TimeoutExpired:
        pass
    time.sleep(min(grace, 0.5))
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    proc.wait()


def watch(proc, dirs, cap_usd: float, timeout: float, interval: float = 5.0, grace: float = 5.0):
    """Wait for proc; kill its process group at the cost cap or the wall timeout.

    Returns None when the process ended on its own within the cap, else "cost cap" or "timeout".
    Usage counts completed messages, so a stop can overshoot by one in-flight message per running
    child. Descendants still alive after the leader ended are killed too.
    """
    start = time.monotonic()
    reason = None
    try:
        while proc.poll() is None:
            if usage_of(*dirs).cost > cap_usd:
                reason = "cost cap"
            elif time.monotonic() - start > timeout:
                reason = "timeout"
            if reason:
                break
            time.sleep(interval)
        if reason is None and usage_of(*dirs).cost > cap_usd:
            reason = "cost cap"  # crossed the cap between two polls
    finally:
        if reason or proc.poll() is None:
            kill_group(proc, grace)
        else:
            try:
                os.killpg(proc.pid, signal.SIGKILL)  # stray descendants of a finished run
            except ProcessLookupError:
                pass
    return reason


def choose_route(check: dict, env: dict):
    """D23: (provider, route text) from an `auth check --provider openai-codex --json` result, or a skip reason."""
    if check.get("status") == "ready":
        return CODEX, "%s (%s)" % (CODEX, check.get("authType"))
    if env.get("PI_SUPERVISOR_ALLOW_API") == "1":
        return "openai", "openai (OPENAI_API_KEY fallback)"
    return None, "openai-codex login not ready (status %r); set PI_SUPERVISOR_ALLOW_API=1 for the API-key route" % (
        check.get("status"),)


def missing_models(listing: str, ids) -> list:
    return [i for i in ids if not re.search(r"(?<![\w.-])%s(?![\w.-])" % re.escape(i), listing)]


def parse_json_lines(stdout: bytes) -> list:
    out = []
    for line in stdout.split(b"\n"):  # LF only: pi output can hold U+2028 inside JSON strings
        if line.startswith(b"{"):
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
    return out


@dataclass
class Run:
    events: list = field(default_factory=list)
    turns: int = 0
    text: str = ""
    usage: Usage = field(default_factory=Usage)
    stopped: str = None
    error: str = None  # errorMessage of a final assistant message that ended in an error
    code: int = None
    stderr: str = ""


def agent_bodies(agents_dir=ROOT / "agents") -> dict:
    out = {}
    for p in Path(agents_dir).glob("*.md"):
        body = p.read_text(encoding="utf-8").split("\n---\n", 1)[1].strip()
        out[p.stem] = body.splitlines()[0][:80]
    return out


class LiveProfile:
    """Install the repo into a temporary profile and prefix; remove both in close()."""

    def __init__(self, tiers: dict, extra_packages=(), separate_login=False, env_extra=None):
        self.tmp = Path(tempfile.mkdtemp(prefix="sup-%s-p6-" % os.urandom(3).hex())).resolve()
        self.profile, self.prefix, self.pkg = self.tmp / "profile", self.tmp / "prefix", self.tmp / "pkg"
        self.launcher = self.prefix / "bin" / "pi-supervisor"
        self.main_dir = self.tmp / "main"
        self.stop_log = self.tmp / "stop.log"
        self.provider = self.route = None
        self.env = {k: v for k, v in os.environ.items() if k != "PI_CODING_AGENT_DIR"}
        self.env.update({"PI_SKIP_VERSION_CHECK": "1", "PI_TELEMETRY": "0", "PI_SUP_STOP_LOG": str(self.stop_log)})
        self.env.update(env_extra or {})
        # Link to the owner's pi logins (D21) only when that file exists, so install never creates
        # anything in the real default profile; existence only, the file is never read here.
        linkable = (Path(self.env.get("HOME", "~")).expanduser() / ".pi" / "agent" / "auth.json").exists()
        args = ["sh", str(self.pkg / "install"), "--profile", str(self.profile), "--prefix", str(self.prefix)]
        try:
            self.pkg.mkdir()
            for name in ("install", "package.json", "extensions", "agents", "skills"):
                src = ROOT / name
                shutil.copytree(src, self.pkg / name) if src.is_dir() else shutil.copy2(src, self.pkg / name)
            self._sh(args + (["--separate-login"] if separate_login or not linkable else []), check=True)
            (self.profile / "pi-supervisor.json").write_text(json.dumps({"version": 1, "tiers": tiers, "critic": None}))
            for pkg in extra_packages:
                self._sh([str(self.launcher), "install", str(pkg)], check=True)
        except BaseException:
            self.close()
            raise

    def _sh(self, args, check=False, cwd=None, timeout=120):
        r = subprocess.run(args, cwd=cwd or self.tmp, env=self.env, capture_output=True, text=True, timeout=timeout)
        assert not check or r.returncode == 0, "%s failed: %s" % (args[:3], r.stderr)
        return r

    def route_check(self):
        """(provider, route) per D23, or (None, reason). No model call."""
        r = self._sh([str(self.launcher), "auth", "check", "--provider", CODEX, "--json"])
        try:
            check = json.loads(r.stdout or "{}")
        except ValueError:
            check = {}
        self.provider, self.route = choose_route(check, os.environ)
        return self.provider, self.route

    def require_models(self, ids) -> None:
        """Fail with the missing ids before any prompt; `--list-models` makes no model call."""
        r = self._sh([str(self.launcher), "--list-models", self.provider])
        missing = missing_models(r.stdout + r.stderr, ids)
        assert not missing, "models not offered on %s: %s" % (self.provider, ", ".join(missing))

    def run(self, prompt: str, cwd, cap_usd: float, timeout: float, interval: float = 5.0, model=None) -> Run:
        shutil.rmtree(self.main_dir, ignore_errors=True)
        args = [str(self.launcher), "--mode", "json", "-p", "--session-dir", str(self.main_dir)]
        args += ["--model", model] if model else []
        out = self.tmp / "stdout.json"
        with open(out, "wb") as fh, open(self.tmp / "stderr.txt", "wb") as eh:
            proc = subprocess.Popen(args + [prompt], cwd=cwd, env=self.env, stdout=fh, stderr=eh,
                                    stdin=subprocess.DEVNULL, start_new_session=True)
            stopped = watch(proc, [self.main_dir, self.profile / "pi-supervisor" / "sessions"], cap_usd, timeout, interval)
        events = parse_json_lines(out.read_bytes())
        ends = [e["message"] for e in events if e.get("type") == "message_end"
                and (e.get("message") or {}).get("role") == "assistant"]
        text = "".join(b.get("text", "") for b in (ends[-1].get("content") or []) if b.get("type") == "text") if ends else ""
        usage = usage_of(self.main_dir, self.profile / "pi-supervisor" / "sessions")
        err = ends[-1].get("errorMessage") or "error" if ends and ends[-1].get("stopReason") == "error" else None
        return Run(events, len(ends), text, usage, stopped, err, proc.returncode,
                   (self.tmp / "stderr.txt").read_text(errors="replace")[-2000:])

    def stop_calls(self) -> list:
        if not self.stop_log.is_file():
            return []
        return [json.loads(l) for l in self.stop_log.read_text().splitlines() if l.strip()]

    def child_sessions(self) -> list:
        """One dict per child: agent, model, thinking, tools, usage. Agent is found by the first
        line of its body in the session's system prompt (as the P1 live test does)."""
        bodies, out = agent_bodies(), []
        for f in session_files(self.profile / "pi-supervisor" / "sessions"):
            es = entries(f)
            system = next((json.dumps(e["message"]) for e in es
                           if e.get("type") == "message" and e["message"].get("role") == "system"), "")
            agent = next((a for a, first in bodies.items() if json.dumps(first)[1:-1] in system), None)
            model = next(({"provider": e.get("provider"), "id": e.get("modelId")} for e in es
                          if e.get("type") == "model_change"), {})
            think = [e.get("thinkingLevel") for e in es if e.get("type") == "thinking_level_change"]
            u = _usage_file(es)
            out.append({"file": str(f), "agent": agent, "model": "%s/%s" % (model.get("provider"), model.get("id")),
                        "thinking": think, "usage": vars(u)})
        return out

    def keep_evidence(self, name: str, summary: dict):
        """Copy sessions, the stop log and summary.json to $PI_SUPERVISOR_EVIDENCE/<UTC>-<name>/ (outside the repo)."""
        base = os.environ.get("PI_SUPERVISOR_EVIDENCE")
        if not base:
            return None
        dest = Path(base) / ("%s-%s" % (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"), name))
        dest.mkdir(parents=True, exist_ok=True)
        for f in session_files(self.main_dir, self.profile / "pi-supervisor" / "sessions"):
            rel = f.relative_to(self.tmp) if f.is_relative_to(self.tmp) else Path(f.name)
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, target)
        if self.stop_log.is_file():
            shutil.copy2(self.stop_log, dest / "stop.log")
        (dest / "summary.json").write_text(json.dumps({"route": self.route, **summary}, indent=2, default=str))
        return dest

    def close(self):
        """Uninstall through ./install, then remove the temporary directory."""
        if (self.pkg / "install").is_file():
            subprocess.run(["sh", str(self.pkg / "install"), "--uninstall", "--yes", "--profile", str(self.profile),
                            "--prefix", str(self.prefix)], env=self.env, capture_output=True, text=True)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def _usage_file(es) -> Usage:
    u = Usage()
    for e in es:
        m = e.get("message") or {}
        if e.get("type") == "message" and m.get("role") == "assistant":
            us = m.get("usage") or {}
            u.input += us.get("input") or 0
            u.output += us.get("output") or 0
            u.cost += (us.get("cost") or {}).get("total") or 0
            u.turns += 1
    return u
