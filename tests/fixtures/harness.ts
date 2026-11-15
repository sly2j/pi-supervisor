// Token-free pi runs for tests: a temporary HOME, profile, package copy and project.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(FIXTURES, "../..");
export const PI = spawnSync("sh", ["-c", "command -v pi"], { encoding: "utf8" }).stdout.trim();

export type Run = { code: number | null; stdout: string; stderr: string; events: any[] };

export class Sandbox {
	root = realpathSync(mkdtempSync(join(tmpdir(), "sup-p1-")));
	home = join(this.root, "home");
	fakeDefault = join(this.home, ".pi", "agent");
	profile = join(this.root, "profile");
	pkg = join(this.root, "pkg");
	proj = join(this.root, "proj");
	log = join(this.root, "agents.log");

	constructor(tiers: Partial<Record<string, string>> = {}, critic: string | null = null) {
		mkdirSync(this.fakeDefault, { recursive: true });
		mkdirSync(this.profile);
		mkdirSync(this.proj);
		cpSync(join(FIXTURES, "package"), this.pkg, { recursive: true });
		cpSync(join(REPO, "extensions"), join(this.pkg, "extensions"), { recursive: true });
		writeFileSync(join(this.profile, "auth.json"), "{}\n", { mode: 0o600 });
		const packages = [this.pkg, join(FIXTURES, "scripted-provider")];
		writeFileSync(join(this.profile, "settings.json"), JSON.stringify({ packages }));
		this.config({ top: "scripted/top", strong: "scripted/strong", standard: "scripted/standard", fast: "scripted/fast", ...tiers }, critic);
		writeFileSync(join(this.proj, "AGENTS.md"), "REPO-CONTEXT-MARKER\n");
	}

	// Copy the P2 stub agents, skills and web package over the package copy; extra files go in too.
	overlay(...extra: [string, string][]) {
		cpSync(join(FIXTURES, "p2", "agents"), join(this.pkg, "agents"), { recursive: true });
		cpSync(join(FIXTURES, "p2", "skills"), join(this.pkg, "skills"), { recursive: true });
		for (const [rel, text] of extra) writeFileSync(join(this.pkg, rel), text);
	}

	webStub = join(FIXTURES, "p2", "web-stub");

	// The scripted provider and no credentials anywhere: nothing is available.
	noModels() {
		writeFileSync(join(this.profile, "settings.json"), JSON.stringify({ packages: [this.pkg] }));
	}

	config(tiers: Record<string, string | undefined>, critic: string | null = null) {
		writeFileSync(join(this.profile, "pi-supervisor.json"), JSON.stringify({ version: 1, tiers, critic }));
	}

	env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
		return {
			HOME: this.home,
			PATH: process.env.PATH,
			PI_CODING_AGENT_DIR: this.profile,
			PI_OFFLINE: "1",
			PI_SKIP_VERSION_CHECK: "1",
			PI_TELEMETRY: "0",
			PI_SUP_TEST_LOG: this.log,
			...extra,
		};
	}

	// Main session on the scripted top model; `script` is the JSON task the provider follows,
	// or a raw prompt string.
	start(script: object | string, extra: Record<string, string> = {}, model = "scripted/top") {
		const args = ["--mode", "json", "-p", "--session-dir", join(this.root, "main-sessions"), "--model", model];
		const prompt = typeof script === "string" ? script : `Task: ${JSON.stringify(script)}`;
		return spawn(PI, [...args, prompt], { cwd: this.proj, env: this.env(extra), stdio: ["ignore", "pipe", "pipe"] });
	}

	run(script: object | string, extra: Record<string, string> = {}, timeoutMs = 60000, model = "scripted/top"): Promise<Run> {
		const p = this.start(script, extra, model);
		let stdout = "";
		let stderr = "";
		p.stdout.on("data", (d) => (stdout += d));
		p.stderr.on("data", (d) => (stderr += d));
		const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
		return new Promise((ok) =>
			p.on("close", (code) => {
				clearTimeout(timer);
				const events = stdout.split("\n").flatMap((l) => {
					try {
						return [JSON.parse(l)];
					} catch {
						return [];
					}
				});
				ok({ code, stdout, stderr, events });
			}),
		);
	}

	logRows(): { pid: number; agent: string; agentDir: string }[] {
		if (!existsSync(this.log)) return [];
		return readFileSync(this.log, "utf8")
			.trim()
			.split("\n")
			.map((l) => l.split("\t"))
			.map(([pid, agent, agentDir]) => ({ pid: Number(pid), agent, agentDir }));
	}

	cleanup() {
		rmSync(this.root, { recursive: true, force: true });
	}
}

// The dispatch tool results of a main run, in call order.
export function toolResults(r: Run): any[] {
	return r.events.filter((e) => e.type === "message_end" && e.message?.role === "toolResult").map((e) => e.message);
}

export function dispatchTask(tasks: object[], then = "main got") {
	return { dispatch: { tasks }, then };
}
