// Literal commands (/close-out, /pick-up, /project-backup, /meeting-summary, /supervisor-memory).
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadAgents, loadSkillBlock, type Parse } from "./agents.ts";
import { type Invocation, runTasks } from "./dispatch.ts";
import { loadConfig } from "./tiers.ts";

export type Level = "info" | "warning" | "error";

// One output path for commands: a notification with a UI, else stderr (stdout carries JSON in json mode).
export function show(ctx: Pick<ExtensionContext, "hasUI" | "ui">, text: string, level: Level = "info"): void {
	if (ctx.hasUI) ctx.ui.notify(text, level);
	else process.stderr.write(`${text}\n`);
}

type Exec = (command: string, args: string[], o?: { cwd?: string }) => Promise<{ stdout: string; stderr: string; code: number }>;

// The git top level of cwd, else cwd itself.
export async function gitTop(exec: Exec, cwd: string): Promise<string> {
	const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd }).catch(() => undefined);
	return r && r.code === 0 && r.stdout.trim() ? r.stdout.trim() : cwd;
}

// Split on whitespace, keeping quoted parts together.
export function splitArgs(s: string): string[] {
	return [...s.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

export type CommandDeps = {
	root: string;
	agentDir: () => string;
	parse: Parse;
	depth: number;
	invocation: (args: string[]) => Invocation;
};

export function registerCommands(pi: ExtensionAPI, d: CommandDeps): void {
	const skills = join(d.root, "skills");

	// /close-out and /pick-up hand the skill block and the arguments to the model as one user message.
	for (const [name, description] of [
		["close-out", "Close out the session's work: /close-out [retry]"],
		["pick-up", "Re-enter a plan or pick tasks: /pick-up [plan path | card...]"],
	] as const) {
		pi.registerCommand(name, {
			description,
			handler: async (args, ctx) => {
				let block: string;
				try {
					block = loadSkillBlock(skills, name);
				} catch {
					return show(ctx, `Skill not found: ${join(skills, name, "SKILL.md")}`, "error");
				}
				pi.sendUserMessage(`${block}\n\n${args.trim()}`);
			},
		});
	}

	// backup.sh needs bash and takes the project root from pwd, so run it from the git top level.
	pi.registerCommand("project-backup", {
		description: "Zip the project into the backup directory",
		handler: async (_args, ctx) => {
			const script = join(skills, "project-backup", "scripts", "backup.sh");
			if (!existsSync(script)) return show(ctx, `Script not found: ${script}`, "error");
			const r = await pi.exec("bash", [script], { cwd: await gitTop((c, a, o) => pi.exec(c, a, o), ctx.cwd) });
			show(ctx, `${r.stdout}${r.stderr}`.trim() || `backup exited with ${r.code}`, r.code === 0 ? "info" : "error");
		},
	});

	// One writer-worker child holds the meeting-summary skill in its prompt; the result is posted without a turn.
	pi.registerCommand("meeting-summary", {
		description: "Minutes from a transcript: /meeting-summary <transcript path> [notes]",
		handler: async (args, ctx) => {
			if (!args.trim()) return show(ctx, "Usage: /meeting-summary <transcript path> [notes]", "warning");
			try {
				const config = loadConfig(d.agentDir());
				if (!config) return show(ctx, "No tier config; run /supervisor-config first.", "error");
				const agent = loadAgents(join(d.root, "agents"), d.parse).find((a) => a.name === "writer-worker");
				if (!agent) return show(ctx, "agents/writer-worker.md not found", "error");
				show(ctx, "Writing the meeting summary...");
				const [res] = await runTasks([{ agent: agent.name, task: args.trim() }], {
					agents: [{ ...agent, skills: [...agent.skills, "meeting-summary"] }],
					config,
					skillsDir: skills,
					depth: d.depth,
					sessionDir: join(d.agentDir(), "pi-supervisor", "sessions", ctx.sessionManager.getSessionId()),
					cwd: ctx.cwd,
					invocation: d.invocation,
				});
				if (res.error) return show(ctx, `meeting-summary failed: ${res.error}`, "error");
				pi.sendMessage({ customType: "pi-supervisor-result", content: res.text, display: true });
			} catch (e) {
				show(ctx, `meeting-summary failed: ${(e as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("supervisor-memory", {
		description: "Project memory store: /supervisor-memory <externalize|link|status> [options]",
		handler: async (args, ctx) => {
			const script = join(skills, "project-memory", "scripts", "memory");
			if (!existsSync(script)) return show(ctx, `Script not found: ${script}`, "error");
			const r = await pi.exec("python3", [script, ...splitArgs(args)], { cwd: ctx.cwd });
			show(ctx, `${r.stdout}${r.stderr}`.trim() || `memory exited with ${r.code}`, r.code === 0 ? "info" : "error");
		},
	});
}
