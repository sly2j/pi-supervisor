import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadAgents } from "../../extensions/supervisor/agents.ts";
import { parse } from "../fixtures/frontmatter.ts";

test("real agents/ load through the P1 loader: 15 agents, valid tiers, leaves cannot dispatch", () => {
	const agents = loadAgents(fileURLToPath(new URL("../../agents/", import.meta.url)), parse);
	assert.equal(agents.length, 15);
	const leads = ["researcher", "planner", "executor", "writer", "supervisor"];
	for (const a of agents) {
		assert.ok(a.body.length > 0 && a.tools?.length, a.name);
		assert.equal(a.tools!.includes("dispatch"), leads.includes(a.name), a.name);
	}
	assert.equal(agents.find((a) => a.name === "fixer")!.thinking, "xhigh");
});
