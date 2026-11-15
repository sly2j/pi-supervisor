// Supervisor for Pi entry. In a child (PI_SUPERVISOR_AGENT set) it only registers dispatch.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type ExtensionAPI, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadAgents } from "./agents.ts";
import { formatResults, killAll, MAX_TASKS, runTasks } from "./dispatch.ts";
import { CONFIG_FILE, loadConfig } from "./tiers.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEPTH = Number(process.env.PI_SUPERVISOR_DEPTH ?? 0) || 0;

// Run the child with the same runtime and pi entry script as this process.
function invocation(args: string[]) {
	const script = process.argv[1];
	if (script && existsSync(script)) return { command: process.execPath, args: [script, ...args] };
	return { command: "pi", args };
}

const Params = Type.Object({
	tasks: Type.Array(
		Type.Object({
			agent: Type.String({ description: "Agent name" }),
			task: Type.String({ description: "Self-contained brief for the agent" }),
			model: Type.Optional(Type.String({ description: "Tier override: top, strong, standard or fast" })),
		}),
		{ minItems: 1, maxItems: MAX_TASKS, description: "Tasks to run in parallel; results come back in order" },
	),
});

export default function (pi: ExtensionAPI) {
	pi.on("session_shutdown", () => killAll());
	pi.registerTool({
		name: "dispatch",
		label: "Dispatch",
		description:
			`Run agents as separate pi processes, 1 to ${MAX_TASKS} tasks per call, up to 6 at once. ` +
			"Each child sees only its task text and returns its final answer.",
		promptSnippet: "Run named agents on self-contained tasks, in parallel",
		parameters: Params,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const agentDir = getAgentDir();
			const config = loadConfig(agentDir);
			if (!config) throw new Error(`no ${CONFIG_FILE} in ${agentDir}; run /supervisor-config to set the model tiers`);
			const agents = loadAgents(join(ROOT, "agents"), parseFrontmatter);
			const results = await runTasks(params.tasks, {
				agents,
				config,
				skillsDir: join(ROOT, "skills"),
				depth: DEPTH,
				sessionDir: join(agentDir, "pi-supervisor", "sessions", ctx.sessionManager.getSessionId()),
				cwd: ctx.cwd,
				invocation,
				signal,
			});
			return { content: [{ type: "text", text: formatResults(results) }], details: { results } };
		},
	});
}
