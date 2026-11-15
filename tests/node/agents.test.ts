import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadAgents } from "../../extensions/supervisor/agents.ts";
import { parse } from "../fixtures/frontmatter.ts";

const FIX = fileURLToPath(new URL("../fixtures/", import.meta.url));
const agents = loadAgents(join(FIX, "package", "agents"), parse);
const get = (name: string) => agents.find((a) => a.name === name)!;

test("load_agent: fixture with tier, excludeTools, skills -> AgentDef fields", () => {
	assert.deepEqual(get("stub-worker"), {
		name: "stub-worker",
		description: "Test worker with a deny list.",
		tier: "fast",
		excludeTools: ["edit", "dispatch"],
		skills: ["stub-skill-a", "stub-skill-b"],
		body: "STUB-WORKER-BODY: you are a test worker.",
	});
	assert.deepEqual(get("stub-lead").skills, ["stub-skill-a"]);
	assert.equal(get("stub-fixer").thinking, "xhigh");
});

test("load_agent_bad_tier: tier gpt -> error naming the file", () => {
	assert.throws(() => loadAgents(join(FIX, "bad-agents"), parse), (e: Error) => {
		assert.match(e.message, /bad-agents\/bad\.md/);
		assert.match(e.message, /"gpt"/);
		return true;
	});
});
