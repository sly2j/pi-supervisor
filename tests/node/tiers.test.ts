import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AgentDef } from "../../extensions/supervisor/agents.ts";
import { type Config, loadConfig, resolveModel } from "../../extensions/supervisor/tiers.ts";

const tiers = { top: "p/top-1", strong: "p/strong-1", standard: "p/standard-1", fast: "p/fast-1:low" };
const config: Config = { version: 1, tiers, critic: null };
const agent = (name: string, tier: AgentDef["tier"]): AgentDef => ({ name, description: "", tier, skills: [], body: "" });

test("resolve_default: executor, no override -> tiers.standard", () => {
	assert.equal(resolveModel(agent("executor", "standard"), undefined, config), "p/standard-1");
});

test("resolve_override: planner, model top -> tiers.top", () => {
	assert.equal(resolveModel(agent("planner", "strong"), "top", config), "p/top-1");
});

test("resolve_unknown: model gpt-6 -> error", () => {
	assert.throws(() => resolveModel(agent("planner", "strong"), "gpt-6", config), /unknown tier "gpt-6"/);
});

test("resolve_critic: critic, config.critic set, model top -> config.critic", () => {
	const c = { ...config, critic: "other/critic-1" };
	assert.equal(resolveModel(agent("critic", "strong"), "top", c), "other/critic-1");
	assert.equal(resolveModel(agent("critic", "strong"), "top", config), "p/top-1");
});

test("loadConfig: missing -> null; valid -> Config; invalid -> error naming the file", () => {
	const dir = mkdtempSync(join(tmpdir(), "sup-p1-tiers-"));
	try {
		assert.equal(loadConfig(dir), null);
		const file = join(dir, "pi-supervisor.json");
		writeFileSync(file, JSON.stringify({ version: 1, tiers, critic: null }));
		assert.deepEqual(loadConfig(dir), config);
		writeFileSync(file, JSON.stringify({ version: 1, tiers: { ...tiers, fast: "fast" }, critic: null }));
		assert.throws(() => loadConfig(dir), (e: Error) => e.message.includes(file) && e.message.includes("tiers.fast"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
