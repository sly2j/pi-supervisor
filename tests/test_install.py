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
PACKAGE = (".gitignore", "install", "package.json", "extensions", "agents", "skills")
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
        self.clone = self.tmp / "pi-supervisor"  # a copy, so no run records its choices in this checkout
        self.clone.mkdir()
        for name in PACKAGE:
            src = ROOT / name
            shutil.copytree(src, self.clone / name) if src.is_dir() else shutil.copy2(src, self.clone / name)
        self.home.mkdir()
        self.default.mkdir()
        (self.default / "auth.json").write_text('{"dummy": {"type": "api_key", "key": "x"}}\n')
        self.env = dict(os.environ, HOME=str(self.home), PI_CODING_AGENT_DIR=str(self.default))

    def install(self, *args, env=None, inp=""):
        return self.bare("--prefix", str(self.prefix), "--profile", str(self.profile), *args, env=env, inp=inp)

    def bare(self, *args, env=None, inp=""):
        argv = ["sh", str(self.clone / "install"), *args]
        return subprocess.run(argv, env=env or self.env, input=inp, capture_output=True, text=True)

    def launcher(self, *args, inp=""):
        env = dict(self.env)
        env.pop("PI_CODING_AGENT_DIR")
        return subprocess.run([str(self.prefix / "bin" / "pi-supervisor"), *args], env=env, input=inp,
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
        r = subprocess.run(["sh", str(self.clone / "install"), "--prefix", str(self.prefix),
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


class TestRecordedChoices(InstallCase):
    """Choices made once are reused; changing one is explicit and confirmed."""
    LOGIN = '{"dummy": {"type": "api_key", "key": "y"}}\n'

    def auth(self):
        return self.profile / "auth.json"

    def test_rerun_without_flags_reuses_choices(self):
        self.assertEqual(self.install().returncode, 0)
        record = (self.clone / ".install.conf").read_text()
        self.assertIn("profile=%s\n" % self.profile, record)
        self.assertIn("prefix=%s\n" % self.prefix, record)
        r = self.bare()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Profile:  %s" % self.profile, r.stdout)
        self.assertFalse((self.home / ".config").exists())
        self.assertFalse((self.home / ".local").exists())

    def test_separate_login_kept_on_rerun(self):
        self.assertEqual(self.install("--separate-login").returncode, 0)
        self.auth().write_text(self.LOGIN)
        self.assertEqual(self.bare().returncode, 0)
        self.assertFalse(self.auth().is_symlink())
        self.assertEqual(self.auth().read_text(), self.LOGIN)
        (self.clone / ".install.conf").unlink()  # also without the record
        self.assertEqual(self.install().returncode, 0)
        self.assertEqual(self.auth().read_text(), self.LOGIN)

    def test_login_change_needs_confirmation(self):
        self.assertEqual(self.install("--separate-login").returncode, 0)
        self.auth().write_text(self.LOGIN)
        r = self.bare("--shared-login", inp="n\n")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("logins: separate -> shared", r.stdout)
        self.assertEqual(self.auth().read_text(), self.LOGIN)
        r = self.bare("--shared-login", inp="y\n")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(self.auth().is_symlink())

    def test_profile_change_needs_confirmation(self):
        self.assertEqual(self.install().returncode, 0)
        other = self.tmp / "other"
        r = self.bare("--profile", str(other))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("profile: %s -> %s" % (self.profile, other), r.stdout)
        self.assertFalse(other.exists())
        r = self.bare("--profile", str(other), "--yes")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("previous profile %s is left in place" % self.profile, r.stdout)
        self.assertIn("profile=%s\n" % other, (self.clone / ".install.conf").read_text())

    def test_profile_change_keeps_login_mode(self):
        self.assertEqual(self.install("--separate-login").returncode, 0)
        other = self.tmp / "other"
        self.assertEqual(self.bare("--profile", str(other), "--yes").returncode, 0)
        self.assertTrue((other / "auth.json").is_file() and not (other / "auth.json").is_symlink())

    def test_prefix_change_removes_old_launcher(self):
        self.assertEqual(self.install().returncode, 0)
        other = self.tmp / "other-prefix"
        self.assertNotEqual(self.bare("--prefix", str(other)).returncode, 0)
        self.assertFalse(other.exists())
        r = self.bare("--prefix", str(other), "--yes")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse((self.prefix / "bin" / "pi-supervisor").exists())
        self.assertTrue((other / "bin" / "pi-supervisor").exists())
        (other / "bin" / "pi-supervisor").unlink()  # the old launcher gone: still a change to confirm
        r = self.bare("--prefix", str(self.prefix))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("launcher: %s" % (other / "bin" / "pi-supervisor"), r.stdout)

    def test_prefix_alias_keeps_launcher(self):
        self.assertEqual(self.install().returncode, 0)
        alias = self.tmp / "alias"
        alias.mkdir()
        (alias / "bin").symlink_to(self.prefix / "bin")
        r = self.bare("--prefix", str(alias), "--yes")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue((self.prefix / "bin" / "pi-supervisor").exists())

    def test_unwritable_clone_fails_before_changes(self):
        self.clone.chmod(0o555)
        self.addCleanup(self.clone.chmod, 0o755)
        r = self.install()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("not writable", r.stderr)
        self.assertFalse(self.profile.exists())

    def test_launcher_of_another_profile_needs_confirmation(self):
        self.assertEqual(self.install().returncode, 0)
        (self.clone / ".install.conf").unlink()
        other = self.tmp / "other"
        r = self.install("--profile", str(other))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("starts another profile", r.stdout)
        self.assertFalse(other.exists())

    def test_uninstall_without_flags(self):
        self.assertEqual(self.install().returncode, 0)
        r = self.bare("--uninstall", "--yes")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(self.profile.exists())
        self.assertFalse((self.prefix / "bin" / "pi-supervisor").exists())
        self.assertFalse((self.clone / ".install.conf").exists())
        self.assertIn("Nothing installed", self.bare("--uninstall", "--yes").stdout)

    def test_launcher_uninstall(self):
        self.assertEqual(self.install().returncode, 0)
        self.assertNotEqual(self.launcher("uninstall", inp="no\n").returncode, 0)
        self.assertTrue(self.profile.exists())
        r = self.launcher("uninstall", inp="pi-supervisor\n")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(self.profile.exists())
        self.assertFalse((self.prefix / "bin" / "pi-supervisor").exists())

    def test_closing_lines_name_update_and_uninstall(self):
        r = self.install()
        launcher = self.prefix / "bin" / "pi-supervisor"
        self.assertIn("Update:    %s update" % launcher, r.stdout)
        self.assertIn("Uninstall: %s uninstall" % launcher, r.stdout)

    def test_old_pi_refused(self):
        fake = self.tmp / "fakebin"
        fake.mkdir()
        (fake / "pi").write_text("#!/bin/sh\necho 1.4.9\n")
        (fake / "pi").chmod(0o755)
        r = self.install(env=dict(self.env, PATH="%s:%s" % (fake, os.environ["PATH"])))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("pi 1.4.9 is older than 1.5.2; run pi update", r.stderr)
        self.assertFalse(self.profile.exists())


class TestUpdate(InstallCase):
    def git(self, *args, cwd):
        r = subprocess.run(["git", "-c", "user.name=test", "-c", "user.email=test@example.invalid", *args],
                           cwd=cwd, env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout

    def setUp(self):
        super().setUp()
        if shutil.which("git") is None:
            self.skipTest("git not on PATH")
        self.upstream = self.clone.rename(self.tmp / "upstream")
        self.git("init", "-q", "-b", "main", cwd=self.upstream)
        self.git("add", "-A", cwd=self.upstream)
        self.git("commit", "-qm", "init", cwd=self.upstream)
        self.git("clone", "-q", "--no-local", str(self.upstream), str(self.clone), cwd=self.tmp)

    def test_launcher_update_pulls_and_reinstalls(self):
        self.assertEqual(self.install("--separate-login").returncode, 0)
        (self.upstream / "NEW").write_text("x\n")
        self.git("add", "NEW", cwd=self.upstream)
        self.git("commit", "-qm", "new", cwd=self.upstream)
        r = self.launcher("update")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue((self.clone / "NEW").exists())
        self.assertIn("Profile:  %s" % self.profile, r.stdout)
        self.assertFalse((self.profile / "auth.json").is_symlink())
        self.assertEqual(self.git("status", "--porcelain", cwd=self.clone), "")

    def test_update_with_arguments_goes_to_pi(self):
        self.assertEqual(self.install().returncode, 0)
        (self.upstream / "NEW").write_text("x\n")
        self.git("add", "NEW", cwd=self.upstream)
        self.git("commit", "-qm", "new", cwd=self.upstream)
        r = self.launcher("update", "--extensions")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse((self.clone / "NEW").exists())

    def test_update_needs_a_git_clone(self):
        shutil.rmtree(self.clone / ".git")
        r = self.bare("--update")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("is not a git clone", r.stderr)


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
