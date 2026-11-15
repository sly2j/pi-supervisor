// The supervisor persona in the main session: top-tier model, the supervisor's tools and prompt.
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AgentDef, parseAgent, type Parse } from "./agents.ts";
import { show } from "./commands.ts";
import { type Config, loadConfig } from "./tiers.ts";

export const ENTRY = "pi-supervisor-persona";
export const STATUS_KEY = "pi-supervisor";
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

type Original = { model?: string; thinking: string; tools: string[] }; // model as provider/id
export type PersonaEntry = { on: boolean; original?: Original };
type Entry = { type: string; customType?: string; data?: unknown };

// The agent's tool list restricted to the registered tools.
export function personaTools(def: AgentDef, all: string[]): string[] {
	if (def.tools) return def.tools.filter((t) => all.includes(t));
	return all.filter((t) => !def.excludeTools?.includes(t));
}

// provider/id[:thinking]; ids may hold colons, so only a trailing pi thinking level counts.
export function parseModelRef(ref: string): { provider: string; id: string; thinking?: string } {
	const slash = ref.indexOf("/");
	let id = ref.slice(slash + 1);
	let thinking: string | undefined;
	const colon = id.lastIndexOf(":");
	if (colon > 0 && LEVELS.includes(id.slice(colon + 1))) {
		thinking = id.slice(colon + 1);
		id = id.slice(0, colon);
	}
	return { provider: ref.slice(0, slash), id, ...(thinking ? { thinking } : {}) };
}

// The latest persona entry of the session, default on.
export function personaState(entries: Entry[]): PersonaEntry {
	const e = entries.filter((x) => x.type === "custom" && x.customType === ENTRY).at(-1);
	return (e?.data as PersonaEntry | undefined) ?? { on: true };
}

export type PersonaDeps = { agentDir: () => string; parse: Parse };

// What the persona needs from the config and the agents; a string reason when it cannot apply.
export function loadPersona(root: string, d: PersonaDeps): { config: Config; def: AgentDef } | { missing: true } | { reason: string } {
	let config: Config | null;
	try {
		config = loadConfig(d.agentDir());
	} catch (e) {
		return { reason: `invalid config: ${(e as Error).message.split(": ").slice(1).join(": ") || "see /supervisor-config doctor"}` };
	}
	if (!config) return { missing: true };
	const file = join(root, "agents", "supervisor.md");
	try {
		return { config, def: parseAgent(file, readFileSync(file, "utf8"), d.parse) };
	} catch (e) {
		return { reason: `agents/supervisor.md: ${(e as Error).message.split(": ").pop()}` };
	}
}

export type Persona = { on(): boolean; status(): string };

export function registerPersona(pi: ExtensionAPI, root: string, d: PersonaDeps): Persona {
	let on = false;
	let status = "supervisor: not set up (/supervisor-config)";
	const set = (ctx: ExtensionContext, text: string, isOn = false) => {
		on = isOn;
		status = text;
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, text);
	};

	// Switch the session to the persona (idempotent). A failure after the persona was on restores the
	// saved settings, since a reload keeps the switched model and tools.
	async function apply(ctx: ExtensionContext, state: PersonaEntry): Promise<void> {
		const fail = async (text: string) => {
			if (state.on && state.original) await restore(ctx, state);
			set(ctx, text);
		};
		const p = loadPersona(root, d);
		if ("missing" in p) return fail("supervisor: not set up (/supervisor-config)");
		if ("reason" in p) return fail(`supervisor: ${p.reason} (/supervisor-config doctor)`);
		if (!state.on) return set(ctx, "supervisor off (/supervisor on)");
		const ref = parseModelRef(p.config.tiers.top);
		const top = ctx.modelRegistry.find(ref.provider, ref.id);
		if (!top) return fail(`supervisor: top model ${p.config.tiers.top} is unknown (/supervisor-config doctor)`);
		// The availability snapshot fills in asynchronously at startup; refresh once before giving up.
		if (!ctx.modelRegistry.hasConfiguredAuth(top)) await ctx.modelRegistry.refresh().catch(() => undefined);
		if (!ctx.modelRegistry.hasConfiguredAuth(top))
			return fail(`supervisor: top model ${p.config.tiers.top} has no credentials (/supervisor-config doctor)`);
		let original = state.original;
		if (!original) {
			original = {
				model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
				thinking: pi.getThinkingLevel(),
				tools: pi.getActiveTools(),
			};
			pi.appendEntry(ENTRY, { on: true, original } satisfies PersonaEntry);
		}
		if (!(await pi.setModel(top))) return fail(`supervisor: top model ${p.config.tiers.top} could not be selected (/supervisor-config doctor)`);
		if (ref.thinking) pi.setThinkingLevel(ref.thinking as never);
		pi.setActiveTools(personaTools(p.def, pi.getAllTools().map((t) => t.name)));
		const weak = Object.entries(p.config.tiers)
			.filter(([t, m]) => {
				if (t === "top") return false;
				const r = parseModelRef(m);
				const found = ctx.modelRegistry.find(r.provider, r.id);
				return !found || !ctx.modelRegistry.hasConfiguredAuth(found);
			})
			.map(([t]) => `${t} has no credentials`);
		set(ctx, `supervisor on · top ${p.config.tiers.top}${weak.map((w) => ` · ${w}`).join("")}`, true);
	}

	async function restore(ctx: ExtensionContext, state: PersonaEntry) {
		const o = state.original;
		if (o?.model) {
			const r = parseModelRef(o.model);
			const m = ctx.modelRegistry.find(r.provider, r.id);
			if (m) await pi.setModel(m);
		}
		if (o) {
			pi.setThinkingLevel(o.thinking as never);
			pi.setActiveTools(o.tools);
		}
	}

	pi.on("session_start", async (_e, ctx) => {
		await apply(ctx, personaState(ctx.sessionManager.getEntries() as Entry[]));
	});

	pi.on("before_agent_start", (e) => {
		if (!on) return;
		const p = loadPersona(root, d);
		if (!("def" in p) || !p.def.body) return;
		return { systemPrompt: `${e.systemPrompt}\n\n${p.def.body}` };
	});

	pi.registerCommand("supervisor", {
		description: "Supervisor persona: /supervisor on | off",
		handler: async (args, ctx) => {
			const arg = args.trim();
			const state = personaState(ctx.sessionManager.getEntries() as Entry[]);
			if (arg === "off") {
				if (state.on) await restore(ctx, state);
				pi.appendEntry(ENTRY, { on: false } satisfies PersonaEntry);
				set(ctx, "supervisor off (/supervisor on)");
				show(ctx, "Supervisor persona is off. Your model, thinking level and tools are restored.");
			} else if (arg === "on") {
				if (!on) await apply(ctx, state.on ? state : { on: true });
				show(ctx, status, on ? "info" : "warning");
			} else if (arg === "") {
				show(ctx, status);
			} else show(ctx, "Usage: /supervisor [on|off]", "warning");
		},
	});

	return { on: () => on, status: () => status };
}
