// Tier config (<agent dir>/pi-supervisor.json) and model resolution. Host-free.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type AgentDef, type Tier, TIERS } from "./agents.ts";

export type Config = { version: 1; tiers: Record<Tier, string>; critic: string | null };

export const CONFIG_FILE = "pi-supervisor.json";
const MODEL = /^[^/\s]+\/\S+$/; // provider/id[:thinking]

// null when the file is missing; an Error naming the file when it is invalid.
export function loadConfig(agentDir: string): Config | null {
	const file = join(agentDir, CONFIG_FILE);
	if (!existsSync(file)) return null;
	const fail = (msg: string) => new Error(`${file}: ${msg}`);
	let raw: any;
	try {
		raw = JSON.parse(readFileSync(file, "utf8"));
	} catch (e) {
		throw fail(`not valid JSON (${(e as Error).message})`);
	}
	if (raw?.version !== 1) throw fail("version must be 1");
	for (const t of TIERS) {
		if (typeof raw.tiers?.[t] !== "string" || !MODEL.test(raw.tiers[t])) throw fail(`tiers.${t} must be "provider/id"`);
	}
	const critic = raw.critic ?? null;
	if (critic !== null && (typeof critic !== "string" || !MODEL.test(critic))) throw fail('critic must be null or "provider/id"');
	return { version: 1, tiers: Object.fromEntries(TIERS.map((t) => [t, raw.tiers[t]])) as Record<Tier, string>, critic };
}

// critic with config.critic set -> config.critic; else a tier override; else the agent's tier.
export function resolveModel(agent: AgentDef, override: string | undefined, config: Config): string {
	if (agent.name === "critic" && config.critic) return config.critic;
	if (override === undefined) return config.tiers[agent.tier];
	if (!TIERS.includes(override as Tier)) throw new Error(`unknown tier "${override}"; use one of ${TIERS.join(", ")}`);
	return config.tiers[override as Tier];
}
