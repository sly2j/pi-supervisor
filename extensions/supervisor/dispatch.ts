// Child pi processes for the dispatch tool. Host-free; index.ts wires it to pi.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentDef, loadSkillBlock } from "./agents.ts";
import { type Config, resolveModel } from "./tiers.ts";

export const MAX_TASKS = 8;
export const MAX_RUNNING = 6;
export const MAX_DEPTH = 2;
export const OUTPUT_CAP = 50 * 1024;
const KILL_AFTER_MS = 5000;
const STDERR_TAIL = 2000;

export type Task = { agent: string; task: string; model?: string };
export type ChildResult = {
	agent: string;
	model: string;
	exitCode: number;
	text: string;
	truncated: boolean;
	usage: { input: number; output: number; cost: number };
	error?: string;
};
export type Invocation = { command: string; args: string[] };

export function buildChildArgs(o: {
	agent: AgentDef;
	model: string;
	sessionDir: string;
	promptFiles: string[];
	task: string;
}): string[] {
	const args = ["--mode", "json", "-p", "--session-dir", o.sessionDir, "--model", o.model];
	if (o.agent.thinking) args.push("--thinking", o.agent.thinking);
	if (o.agent.tools) args.push("--tools", o.agent.tools.join(","));
	else if (o.agent.excludeTools) args.push("--exclude-tools", o.agent.excludeTools.join(","));
	for (const f of o.promptFiles) args.push("--append-system-prompt", f);
	args.push(`Task: ${o.task}`);
	return args;
}

// The agent body, then one pi skill block per preloaded skill (D5), one file each.
export function writePromptFiles(agent: AgentDef, skillsDir: string, dir: string): string[] {
	return [agent.body, ...agent.skills.map((s) => loadSkillBlock(skillsDir, s))].map((text, i) => {
		const f = join(dir, `${i}.md`);
		writeFileSync(f, text, { mode: 0o600 });
		return f;
	});
}

// Every live child of this process, so abort and exit can reach them.
const live = new Set<ChildProcess>();

export function killAll(): void {
	for (const p of live) terminate(p);
}

function terminate(p: ChildProcess): void {
	if (p.exitCode !== null || p.signalCode !== null) return;
	p.kill("SIGTERM");
	setTimeout(() => {
		if (p.exitCode === null && p.signalCode === null) p.kill("SIGKILL");
	}, KILL_AFTER_MS).unref();
}

let exitHook = false;
function hookExit(): void {
	if (exitHook) return;
	exitHook = true;
	process.on("exit", () => {
		for (const p of live) if (p.exitCode === null) p.kill("SIGTERM");
	});
}

const textOf = (content: unknown): string =>
	Array.isArray(content)
		? content
				.filter((b) => b?.type === "text")
				.map((b) => b.text)
				.join("")
		: String(content ?? "");

export function runChild(o: {
	invocation: Invocation;
	agent: string;
	model: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
	signal?: AbortSignal;
}): Promise<ChildResult> {
	const r: ChildResult = {
		agent: o.agent,
		model: o.model,
		exitCode: -1,
		text: "",
		truncated: false,
		usage: { input: 0, output: 0, cost: 0 },
	};
	hookExit();
	return new Promise((resolve) => {
		let stopReason = "";
		let errorMessage = "";
		let stderr = "";
		let buf = "";
		let aborted = false;
		const line = (l: string) => {
			let ev: any;
			try {
				ev = JSON.parse(l);
			} catch {
				return;
			}
			const m = ev?.type === "message_end" ? ev.message : undefined;
			if (m?.role !== "assistant") return;
			r.text = textOf(m.content);
			if (m.model) r.model = `${m.provider}/${m.model}`;
			r.usage.input += m.usage?.input ?? 0;
			r.usage.output += m.usage?.output ?? 0;
			r.usage.cost += m.usage?.cost?.total ?? 0;
			stopReason = m.stopReason ?? "";
			errorMessage = m.errorMessage ?? "";
		};
		const proc = spawn(o.invocation.command, o.invocation.args, {
			cwd: o.cwd,
			env: o.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		live.add(proc);
		const onAbort = () => {
			aborted = true;
			terminate(proc);
		};
		if (o.signal?.aborted) onAbort();
		else o.signal?.addEventListener("abort", onAbort, { once: true });
		proc.stdout!.setEncoding("utf8");
		proc.stderr!.setEncoding("utf8");
		proc.stdout!.on("data", (d: string) => {
			buf += d;
			const lines = buf.split("\n");
			buf = lines.pop()!;
			for (const l of lines) line(l);
		});
		proc.stderr!.on("data", (d: string) => {
			stderr = (stderr + d).slice(-STDERR_TAIL);
		});
		const done = (code: number | null, err?: Error) => {
			live.delete(proc);
			o.signal?.removeEventListener("abort", onAbort);
			if (buf) line(buf);
			r.exitCode = code ?? -1;
			if (Buffer.byteLength(r.text) > OUTPUT_CAP) {
				r.text = Buffer.from(r.text).subarray(0, OUTPUT_CAP).toString();
				r.truncated = true;
			}
			const tail = stderr.trim();
			if (err) r.error = `could not start pi: ${err.message}`;
			else if (aborted) r.error = "aborted";
			else if (code !== 0) r.error = `exit ${code ?? "by signal"}${tail ? `: ${tail}` : ""}`;
			else if (stopReason === "error" || stopReason === "aborted")
				r.error = errorMessage || tail || `stopReason ${stopReason}`;
			resolve(r);
		};
		proc.on("error", (e) => done(null, e));
		proc.on("close", (code) => done(code));
	});
}

export type RunEnv = {
	agents: AgentDef[];
	config: Config;
	skillsDir: string;
	depth: number;
	sessionDir: string;
	cwd: string;
	invocation: (args: string[]) => Invocation;
	env?: NodeJS.ProcessEnv;
	signal?: AbortSignal;
};

async function runTask(t: Task, e: RunEnv): Promise<ChildResult> {
	const fail = (error: string, model = ""): ChildResult => ({
		agent: t.agent,
		model,
		exitCode: -1,
		text: "",
		truncated: false,
		usage: { input: 0, output: 0, cost: 0 },
		error,
	});
	const agent = e.agents.find((a) => a.name === t.agent);
	if (!agent) return fail(`unknown agent "${t.agent}"; known: ${e.agents.map((a) => a.name).join(", ")}`);
	let model: string;
	try {
		model = resolveModel(agent, t.model, e.config);
	} catch (err) {
		return fail((err as Error).message);
	}
	const tmp = mkdtempSync(join(tmpdir(), "pi-supervisor-"));
	try {
		const files = writePromptFiles(agent, e.skillsDir, tmp);
		const args = buildChildArgs({ agent, model, sessionDir: e.sessionDir, promptFiles: files, task: t.task });
		return await runChild({
			invocation: e.invocation(args),
			agent: agent.name,
			model,
			cwd: e.cwd,
			env: { ...(e.env ?? process.env), PI_SUPERVISOR_AGENT: agent.name, PI_SUPERVISOR_DEPTH: String(e.depth + 1) },
			signal: e.signal,
		});
	} catch (err) {
		return fail((err as Error).message, model);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

// Results in input order, at most MAX_RUNNING children at once.
export async function runTasks(tasks: Task[], e: RunEnv): Promise<ChildResult[]> {
	if (e.depth >= MAX_DEPTH) throw new Error(`dispatch refused: depth ${e.depth} is the limit (${MAX_DEPTH})`);
	if (tasks.length < 1 || tasks.length > MAX_TASKS) throw new Error(`dispatch takes 1 to ${MAX_TASKS} tasks`);
	const out: ChildResult[] = new Array(tasks.length);
	let next = 0;
	const worker = async () => {
		while (next < tasks.length) {
			const i = next++;
			out[i] = await runTask(tasks[i], e);
		}
	};
	await Promise.all(Array.from({ length: Math.min(MAX_RUNNING, tasks.length) }, worker));
	return out;
}

export function formatResults(results: ChildResult[]): string {
	return results
		.map((r, i) => {
			const head = `## ${i + 1}. ${r.agent} (${r.model || "no model"})${r.error ? " FAILED" : ""}`;
			const body = r.error ? `Error: ${r.error}${r.text ? `\n\n${r.text}` : ""}` : r.text;
			return `${head}\n\n${body}${r.truncated ? "\n\n[output truncated at 50 KB]" : ""}`;
		})
		.join("\n\n");
}
