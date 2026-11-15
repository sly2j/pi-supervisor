// Slice 1c, opt-in (PI_SUPERVISOR_LIVE=1, costs tokens): one live nested run through the
// launcher, installed into a temporary profile and prefix whose auth.json links to the user's
// pi logins (D21). Route per D23: openai-codex when ready, else openai on OPENAI_API_KEY.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const LIVE = join(REPO, "tests", "fixtures", "live");
const skip = process.env.PI_SUPERVISOR_LIVE === "1" ? false : "set PI_SUPERVISOR_LIVE=1 to run (costs tokens)";
// Cheapest catalog models per route (pi 1.5.2): lead and main on one, worker and critic on another.
const MODELS = { big: "gpt-5.6-luna", small: "gpt-6-luna" };

const files = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const entries = (f: string) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("live_nested: stub lead, real models -> worker and critic texts, per-child models and tools", { skip, timeout: 600000 }, (t) => {
	const tmp = realpathSync(mkdtempSync(join(tmpdir(), "sup-p1-live-")));
	const pkg = join(tmp, "pkg");
	const profile = join(tmp, "profile");
	const prefix = join(tmp, "prefix");
	const env = { ...process.env };
	delete env.PI_CODING_AGENT_DIR;
	const sh = (cmd: string, args: string[], cwd = tmp) => spawnSync(cmd, args, { cwd, env, encoding: "utf8", timeout: 540000 });
	try {
		mkdirSync(pkg);
		for (const f of ["install", "package.json", "extensions"]) cpSync(join(REPO, f), join(pkg, f), { recursive: true });
		cpSync(join(LIVE, "agents"), join(pkg, "agents"), { recursive: true });
		cpSync(join(LIVE, "skills"), join(pkg, "skills"), { recursive: true });
		const inst = sh("sh", [join(pkg, "install"), "--profile", profile, "--prefix", prefix]);
		assert.equal(inst.status, 0, inst.stderr);
		const launcher = join(prefix, "bin", "pi-supervisor");

		const check = sh(launcher, ["auth", "check", "--provider", "openai-codex", "--json"]);
		const codex = JSON.parse(check.stdout || "{}");
		const provider = codex.status === "ready" ? "openai-codex" : "openai";
		const route = provider === "openai-codex" ? `openai-codex (${codex.authType})` : "openai (OPENAI_API_KEY fallback)";
		t.diagnostic(`route: ${route}`);
		const big = `${provider}/${MODELS.big}`;
		const small = `${provider}/${MODELS.small}`;
		const tiers = { top: big, strong: big, standard: `${small}:low`, fast: `${small}:low` };
		writeFileSync(join(profile, "pi-supervisor.json"), JSON.stringify({ version: 1, tiers, critic: null }));

		const prompt =
			'Call the dispatch tool once with tasks [{"agent": "stub-lead", "task": "Run your test."}]. ' +
			"Then reply with the tool result text verbatim.";
		const main = sh(launcher, ["--mode", "json", "-p", "--session-dir", join(tmp, "main"), "--model", `${big}:low`, prompt]);
		assert.equal(main.status, 0, main.stderr);
		const events = main.stdout.split("\n").flatMap((l) => (l.startsWith("{") ? [JSON.parse(l)] : []));
		const tool = events.filter((e) => e.type === "message_end" && e.message.role === "toolResult").at(-1)?.message;
		assert.ok(tool, "main called dispatch");
		t.diagnostic(`result block:\n${tool.content[0].text}`);
		const [lead] = tool.details.results;
		assert.equal(lead.error, undefined, lead.error);
		assert.equal(lead.model, big);
		assert.match(lead.text, /ZEBRA-41/);
		assert.match(lead.text, /CRITIC-OK/);

		// Children of the lead: model and tools from their session files (D15).
		const sessions = files(join(profile, "pi-supervisor", "sessions")).filter((f) => f.endsWith(".jsonl"));
		const child = (name: string) => {
			const isSystem = (e: any) => e.type === "message" && e.message.role === "system";
			const s = sessions.map(entries).find((es) => es.some((e) => isSystem(e) && JSON.stringify(e.message).includes(`You are a test ${name}.`)));
			assert.ok(s, `${name} session`);
			const m = s.find((e) => e.type === "model_change");
			const sys = s.find(isSystem).message;
			return { model: `${m.provider}/${m.modelId}`, tools: sys.toolsAdded.map((x: any) => x.name) };
		};
		const worker = child("worker");
		const critic = child("critic");
		t.diagnostic(`worker: ${worker.model} tools ${worker.tools}; critic: ${critic.model} tools ${critic.tools}`);
		assert.equal(worker.model, small);
		assert.equal(critic.model, small);
		assert.ok(!worker.tools.includes("edit") && !worker.tools.includes("dispatch"), String(worker.tools));
		assert.deepEqual([...critic.tools].sort(), ["find", "grep", "ls", "read"]);

		const usage = [join(tmp, "main"), join(profile, "pi-supervisor", "sessions")]
			.flatMap(files)
			.filter((f) => f.endsWith(".jsonl"))
			.flatMap(entries)
			.filter((e) => e.type === "message" && e.message.role === "assistant")
			.reduce((u, e) => ({
				input: u.input + (e.message.usage?.input ?? 0),
				output: u.output + (e.message.usage?.output ?? 0),
				cost: u.cost + (e.message.usage?.cost?.total ?? 0),
			}), { input: 0, output: 0, cost: 0 });
		t.diagnostic(`usage: ${JSON.stringify(usage)} over ${sessions.length + 1} sessions`);
	} finally {
		sh("sh", [join(pkg, "install"), "--uninstall", "--yes", "--profile", profile, "--prefix", prefix]);
		rmSync(tmp, { recursive: true, force: true });
	}
});
