"""Tests for ./install, run with a temporary HOME, prefix, profile and fake default agent dir."""
import glob
import hashlib
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INSTALL = ROOT / "install"
SECRET = "sk-test-0123456789abcdefghijklmnop"


def tree_digest(path):
    h = hashlib.sha256()
    for p in sorted(Path(path).rglob("*")):
        h.update(str(p.relative_to(path)).encode())
        if p.is_file() and not p.is_symlink():
            h.update(p.read_bytes())
    return h.hexdigest()


class InstallCase(unittest.TestCase):
    def setUp(self):
        if shutil.which("pi") is None:
            self.skipTest("pi not on PATH")
        self.tmp = Path(tempfile.mkdtemp(prefix="sup-install-")).resolve()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.home = self.tmp / "home"
        self.default = self.tmp / "default-agent"
        self.prefix = self.tmp / "prefix"
        self.profile = self.tmp / "profile"
        self.home.mkdir()
        self.default.mkdir()
        (self.default / "auth.json").write_text('{"dummy": {"type": "api_key", "key": "x"}}\n')
        self.env = dict(os.environ, HOME=str(self.home), PI_CODING_AGENT_DIR=str(self.default))

    def install(self, *args, env=None, inp=None):
        argv = ["sh", str(INSTALL), "--prefix", str(self.prefix), "--profile", str(self.profile), *args]
        return subprocess.run(argv, env=env or self.env, input=inp, capture_output=True, text=True)

    def launcher(self, *args):
        env = dict(self.env)
        env.pop("PI_CODING_AGENT_DIR")
        return subprocess.run([str(self.prefix / "bin" / "pi-supervisor"), *args], env=env,
                              capture_output=True, text=True)


class TestInstall(InstallCase):
    def test_package_loads(self):
        self.assertEqual(self.install().returncode, 0)
        r = self.launcher("list")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("pi-supervisor", r.stdout + r.stderr)

    def test_launcher_runs(self):
        self.assertEqual(self.install().returncode, 0)
        r = self.launcher("--version")
        expect = subprocess.run(["pi", "--version"], env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout + r.stderr, expect.stdout + expect.stderr)

    def test_auth_linked(self):
        self.assertEqual(self.install().returncode, 0)
        auth = self.profile / "auth.json"
        self.assertTrue(auth.is_symlink())
        self.assertEqual(os.path.realpath(auth), str(self.default / "auth.json"))
        self.assertEqual(oct(self.profile.stat().st_mode & 0o777), "0o700")

    def test_auth_link_write_through(self):
        found = glob.glob(os.path.expanduser(
            "~/.pi/agent/install/releases/*/node_modules/@earendil-works/pi-coding-agent/"
            "dist/core/auth-storage.js"))
        if not found or shutil.which("node") is None:
            self.skipTest("pi's auth-storage.js or node not found")
        self.assertEqual(self.install().returncode, 0)
        script = ("import(process.argv[1]).then(m => m.AuthStorage.create(process.argv[2])"
                  ".modify('sup-test', async () => ({type: 'api_key', key: process.argv[3]})))")
        auth = self.profile / "auth.json"
        r = subprocess.run(["node", "-e", script, found[-1], str(auth), SECRET],
                           env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(SECRET, (self.default / "auth.json").read_text())
        self.assertTrue(auth.is_symlink())

    def test_separate_login(self):
        self.assertEqual(self.install("--separate-login").returncode, 0)
        auth = self.profile / "auth.json"
        self.assertTrue(auth.is_file() and not auth.is_symlink())
        self.assertEqual(auth.read_text().strip(), "{}")

    def test_refuses_default_dir(self):
        before = tree_digest(self.default)
        env = dict(self.env)
        r = subprocess.run(["sh", str(INSTALL), "--prefix", str(self.prefix),
                            "--profile", str(self.default)], env=env, capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(tree_digest(self.default), before)
        self.assertFalse(self.prefix.exists())

    def test_refuses_foreign_launcher(self):
        (self.prefix / "bin").mkdir(parents=True)
        foreign = self.prefix / "bin" / "pi-supervisor"
        foreign.write_text("#!/bin/sh\necho mine\n")
        r = self.install()
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(foreign.read_text(), "#!/bin/sh\necho mine\n")
        self.assertFalse(self.profile.exists())

    def test_refuses_dotdot_path(self):
        before = tree_digest(self.default)
        r = self.install("--profile", str(self.tmp / "missing" / ".." / "default-agent"))
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(tree_digest(self.default), before)
        shutil.rmtree(self.default)
        r = self.install("--profile", str(self.default) + "/")
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse(self.default.exists())
        self.default.mkdir()
        (self.default / "auth.json").write_text("{}\n")
        before = tree_digest(self.default)
        r = self.install("--profile", str(self.default) + "/.")
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(tree_digest(self.default), before)

    def test_profile_with_apostrophe(self):
        self.profile = self.tmp / "owner's profile"
        self.assertEqual(self.install().returncode, 0)
        r = self.launcher("--version")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_unwritable_prefix_fails(self):
        self.prefix.write_text("a file, not a directory")
        self.assertNotEqual(self.install().returncode, 0)

    def test_default_dir_untouched(self):
        before = tree_digest(self.default)
        self.assertEqual(self.install().returncode, 0)
        self.assertEqual(self.install("--uninstall", "--yes").returncode, 0)
        self.assertEqual(tree_digest(self.default), before)

    def test_uninstall(self):
        self.assertEqual(self.install().returncode, 0)
        r = self.install("--uninstall", "--yes")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse((self.prefix / "bin" / "pi-supervisor").exists())
        self.assertFalse(self.profile.exists())
        self.assertTrue((self.default / "auth.json").is_file())

    def test_uninstall_needs_confirmation(self):
        self.assertEqual(self.install().returncode, 0)
        self.assertNotEqual(self.install("--uninstall", inp="no\n").returncode, 0)
        self.assertTrue(self.profile.exists())
        self.assertEqual(self.install("--uninstall", inp="pi-supervisor\n").returncode, 0)
        self.assertFalse(self.profile.exists())

    def test_reinstall_idempotent(self):
        self.assertEqual(self.install().returncode, 0)
        self.assertEqual(self.install().returncode, 0)
        r = self.launcher("list")
        self.assertEqual(len(re.findall(r"^  \S", r.stdout, re.M)), 1, r.stdout)

    def test_path_hint(self):
        env = dict(self.env, PATH=os.environ["PATH"])
        r = self.install(env=env)
        self.assertIn("export PATH=", r.stdout)
        self.assertEqual([p.name for p in self.home.iterdir()], [])


class TestNoSecrets(unittest.TestCase):
    PATTERNS = [re.compile(r"\b(sk|ghp|gho|xox[bp])[-_][A-Za-z0-9_-]{20,}"),
                re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
                re.compile(r"AKIA[0-9A-Z]{16}")]

    def test_no_secrets(self):
        r = subprocess.run(["git", "-C", str(ROOT), "ls-files"], capture_output=True, text=True)
        if r.returncode != 0:
            self.skipTest("not a git checkout")
        for name in r.stdout.splitlines():
            self.assertNotEqual(Path(name).name, "auth.json", name)
            if name == "tests/test_install.py":
                continue  # holds the dummy test key
            path = ROOT / name
            if not path.is_file() or path.is_symlink():
                continue
            try:
                text = path.read_text()
            except UnicodeDecodeError:
                continue
            for pat in self.PATTERNS:
                self.assertIsNone(pat.search(text), "%s matches %s" % (name, pat.pattern))


if __name__ == "__main__":
    unittest.main()
