// Agent definitions (agents/*.md) and skill blocks. Host-free: the frontmatter parser is passed in.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const TIERS = ["top", "strong", "standard", "fast"] as const;
export type Tier = (typeof TIERS)[number];

export type AgentDef = {
	name: string;
	description: string;
	tier: Tier;
	thinking?: string;
	tools?: string[];
	excludeTools?: string[];
	skills: string[];
	body: string;
};

export type Parse = (content: string) => { frontmatter: Record<string, unknown>; body: string };

// A YAML list or a comma-separated string.
function list(value: unknown): string[] | undefined {
	if (value === undefined || value === null) return undefined;
	const items = Array.isArray(value) ? value.map(String) : String(value).split(",");
	return items.map((s) => s.trim()).filter(Boolean);
}

export function parseAgent(file: string, content: string, parse: Parse): AgentDef {
	const { frontmatter: fm, body } = parse(content);
	const fail = (msg: string) => new Error(`${file}: ${msg}`);
	if (typeof fm.name !== "string" || !fm.name) throw fail("missing name");
	if (typeof fm.description !== "string") throw fail("missing description");
	if (!TIERS.includes(fm.tier as Tier)) throw fail(`tier ${JSON.stringify(fm.tier)} is not one of ${TIERS.join(", ")}`);
	const tools = list(fm.tools);
	const excludeTools = list(fm.excludeTools);
	if (tools && excludeTools) throw fail("tools and excludeTools are exclusive");
	return {
		name: fm.name,
		description: fm.description,
		tier: fm.tier as Tier,
		...(fm.thinking ? { thinking: String(fm.thinking) } : {}),
		...(tools ? { tools } : {}),
		...(excludeTools ? { excludeTools } : {}),
		skills: list(fm.skills) ?? [],
		body: body.trim(),
	};
}

export function loadAgents(dir: string, parse: Parse): AgentDef[] {
	return readdirSync(dir)
		.filter((f) => f.endsWith(".md"))
		.sort()
		.map((f) => parseAgent(join(dir, f), readFileSync(join(dir, f), "utf8"), parse));
}

// The block pi itself builds for /skill:name (agent-session.js, _expandSkillCommand).
export function loadSkillBlock(dir: string, name: string): string {
	const base = join(dir, name);
	const file = join(base, "SKILL.md");
	const body = readFileSync(file, "utf8")
		.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
		.trim();
	return `<skill name="${name}" location="${file}">\nReferences are relative to ${base}.\n\n${body}\n</skill>`;
}
