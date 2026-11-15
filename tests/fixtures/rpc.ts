// RPC driver for tests: `pi --mode rpc` in a sandbox, with scripted answers to dialogs.
import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { PI, type Sandbox } from "./harness.ts";

export type Reply = { value?: string; confirmed?: boolean; cancelled?: true };
type Rule = { method: string; title?: RegExp; reply: Reply | ((req: any) => Reply) };

export class Rpc {
	events: any[] = [];
	requests: any[] = []; // every extension_ui_request seen
	unexpected: any[] = [];
	stderr = "";
	private proc: ChildProcess;
	private rules: Rule[] = [];
	private pending = new Map<string, (r: any) => void>();
	private waiters: { pred: (e: any) => boolean; ok: (e: any) => void }[] = [];
	private seq = 0;
	private buf = "";

	constructor(box: Sandbox, o: { model?: string | null; env?: Record<string, string>; args?: string[] } = {}) {
		const model = o.model === undefined ? "scripted/top" : o.model;
		const args = ["--mode", "rpc", "--session-dir", join(box.root, "main-sessions"), ...(model ? ["--model", model] : []), ...(o.args ?? [])];
		this.proc = spawn(PI, args, { cwd: box.proj, env: box.env(o.env), stdio: ["pipe", "pipe", "pipe"] });
		this.proc.stdout!.setEncoding("utf8");
		this.proc.stderr!.setEncoding("utf8");
		this.proc.stderr!.on("data", (d: string) => (this.stderr += d));
		this.proc.stdout!.on("data", (d: string) => {
			this.buf += d;
			const lines = this.buf.split("\n");
			this.buf = lines.pop()!;
			for (const l of lines) this.line(l);
		});
	}

	private line(l: string) {
		let ev: any;
		try {
			ev = JSON.parse(l);
		} catch {
			return;
		}
		if (ev.type === "response" && this.pending.has(ev.id)) {
			this.pending.get(ev.id)!(ev);
			this.pending.delete(ev.id);
			return;
		}
		this.events.push(ev);
		if (ev.type === "extension_ui_request") {
			this.requests.push(ev);
			if (["select", "confirm", "input", "editor"].includes(ev.method)) this.dialog(ev);
		}
		for (const w of [...this.waiters]) {
			if (w.pred(ev)) {
				this.waiters.splice(this.waiters.indexOf(w), 1);
				w.ok(ev);
			}
		}
	}

	private dialog(req: any) {
		const i = this.rules.findIndex((r) => r.method === req.method && (!r.title || r.title.test(req.title ?? "")));
		let reply: Reply = { cancelled: true };
		if (i < 0) this.unexpected.push(req);
		else {
			const [rule] = this.rules.splice(i, 1);
			reply = typeof rule.reply === "function" ? rule.reply(req) : rule.reply;
		}
		this.send({ type: "extension_ui_response", id: req.id, ...reply });
	}

	send(cmd: object) {
		this.proc.stdin!.write(`${JSON.stringify(cmd)}\n`);
	}

	// Queue an answer for the next dialog of this method (and title); one answer is used once.
	answer(method: string, title: RegExp | undefined, reply: Reply | ((req: any) => Reply)) {
		this.rules.push({ method, title, reply });
		return this;
	}

	request(cmd: object, timeoutMs = 30000): Promise<any> {
		const id = `r${++this.seq}`;
		return new Promise((ok, fail) => {
			const t = setTimeout(() => fail(new Error(`no response to ${JSON.stringify(cmd)}\n${this.stderr}`)), timeoutMs);
			this.pending.set(id, (r) => (clearTimeout(t), ok(r)));
			this.send({ ...cmd, id });
		});
	}

	// Resolves with the first event (past or future, from `from`) that satisfies pred.
	waitFor(pred: (e: any) => boolean, timeoutMs = 30000, from = 0): Promise<any> {
		const seen = this.events.slice(from).find(pred);
		if (seen) return Promise.resolve(seen);
		return new Promise((ok, fail) => {
			const t = setTimeout(() => fail(new Error(`timeout waiting for event; seen: ${this.events.map((e) => e.method ?? e.type).join(",")} ${this.status() ?? ""}\n${this.stderr}`)), timeoutMs);
			this.waiters.push({ pred, ok: (e) => (clearTimeout(t), ok(e)) });
		});
	}

	// Run a prompt (a command or a model turn) and wait until it settles; returns the event index before it.
	async prompt(message: string): Promise<{ response: any; from: number }> {
		const from = this.events.length;
		const response = await this.request({ type: "prompt", message });
		if (response.data?.disposition === "started") await this.waitFor((e) => e.type === "agent_settled", 30000, from);
		return { response, from };
	}

	async state(): Promise<any> {
		return (await this.request({ type: "get_state" })).data;
	}

	notifications(from = 0): { message: string; type: string }[] {
		return this.events
			.slice(from)
			.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
			.map((e) => ({ message: e.message, type: e.notifyType ?? "info" }));
	}

	// The last text set for a status key, undefined when cleared or never set.
	status(key = "pi-supervisor"): string | undefined {
		const all = this.events.filter((e) => e.type === "extension_ui_request" && e.method === "setStatus" && e.statusKey === key);
		return all.at(-1)?.statusText;
	}

	// Wait for a status text matching re (the first start emits it during startup).
	async waitStatus(re: RegExp, key = "pi-supervisor"): Promise<string> {
		const e = await this.waitFor((e) => e.type === "extension_ui_request" && e.method === "setStatus" && e.statusKey === key && re.test(e.statusText ?? ""));
		return e.statusText;
	}

	// Text of the last assistant message after `from`.
	lastReply(from = 0): string {
		const m = this.events
			.slice(from)
			.filter((e) => e.type === "message_end" && e.message?.role === "assistant")
			.at(-1)?.message;
		return (m?.content ?? []).map((b: any) => b.text ?? "").join("");
	}

	// Ask the model (scripted) something and return its reply.
	async ask(script: object): Promise<string> {
		const { from } = await this.prompt(`Task: ${JSON.stringify(script)}`);
		return this.lastReply(from);
	}

	async close() {
		const p = this.proc;
		if (p.exitCode === null) {
			p.stdin!.end();
			await new Promise<void>((ok) => {
				const t = setTimeout(() => (p.kill("SIGKILL"), ok()), 3000);
				p.on("close", () => (clearTimeout(t), ok()));
			});
		}
	}
}
