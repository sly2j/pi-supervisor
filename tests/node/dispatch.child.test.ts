// Slice 1a: one configured, restricted child end to end, on the scripted provider (D17).
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { dispatchTask, PI, Sandbox, toolResults } from "../fixtures/harness.ts";

const skip = PI ? false : "pi not on PATH";
const boxes: Sandbox[] = [];
const box = (...a: ConstructorParameters<typeof Sandbox>) => (boxes.push(new Sandbox(...a)), boxes.at(-1)!);
after(() => boxes.forEach((b) => b.cleanup()));

async function dispatchOne(s: Sandbox, agent: string, script: object) {
	const r = await s.run(dispatchTask([{ agent, task: JSON.stringify(script) }]));
	assert.equal(r.code, 0, r.stderr);
	const [res] = toolResults(r);
	return { r, res, result: res.details?.results?.[0] };
}

test("child_text: scripted provider says done -> result text done, exitCode 0", { skip }, async () => {
	const { result } = await dispatchOne(box(), "stub-worker", { say: "done" });
	assert.equal(result.text, "done");
	assert.equal(result.exitCode, 0);
	assert.equal(result.model, "scripted/fast");
	assert.equal(result.error, undefined);
});

test("child_no_auth: tier on a provider without credentials -> error entry with stderr tail", { skip }, async () => {
	const { result } = await dispatchOne(box({ fast: "anthropic/claude-haiku-4-5" }), "stub-worker", { say: "x" });
	assert.notEqual(result.exitCode, 0);
	assert.match(result.error, /No API key found for anthropic/);
});

test("child_provider_error: provider error with exit 0 -> error entry", { skip }, async () => {
	const { res, result } = await dispatchOne(box(), "stub-worker", { error: "scripted failure" });
	assert.equal(result.exitCode, 0);
	assert.equal(result.error, "scripted failure");
	assert.match(res.content[0].text, /stub-worker \(scripted\/fast\) FAILED\n\nError: scripted failure/);
});

test("child_sees_prompt: system prompt has agent body, skill bodies, repo context; before_agent_start fires", { skip }, async () => {
	const { r, result } = await dispatchOne(box(), "stub-worker", { echoSystem: true });
	for (const marker of ["STUB-WORKER-BODY", "STUB-SKILL-A-BODY", "STUB-SKILL-B-BODY", "REPO-CONTEXT-MARKER", "BEFORE-AGENT-START-MARKER"])
		assert.ok(result.text.includes(marker), marker);
	assert.match(result.text, /<skill name="stub-skill-b" location="[^"]+">\nReferences are relative to /);
	assert.equal(r.stderr, "", "no skill or extension warning on stderr");
});

test("skill block equals pi's own /skill:name expansion (D5)", { skip }, async () => {
	const s = box();
	const r = await s.run('/skill:stub-skill-a {"echoUser":true}');
	const text = r.events.filter((e) => e.type === "message_end" && e.message.role === "assistant").at(-1).message.content[0].text;
	const { loadSkillBlock } = await import("../../extensions/supervisor/agents.ts");
	assert.equal(text, `${loadSkillBlock(join(s.pkg, "skills"), "stub-skill-a")}\n\n{"echoUser":true}`);
});

test("config_missing: no file -> dispatch error naming /supervisor-config", { skip }, async () => {
	const s = box();
	rmSync(join(s.profile, "pi-supervisor.json"));
	const r = await s.run(dispatchTask([{ agent: "stub-worker", task: "{}" }]));
	const [res] = toolResults(r);
	assert.equal(res.isError, true);
	assert.match(res.content[0].text, /\/supervisor-config/);
});

test("unknown agent and unknown tier -> error entries, other tasks still run", { skip }, async () => {
	const r = await box().run(
		dispatchTask([
			{ agent: "nobody", task: "{}" },
			{ agent: "stub-worker", model: "gpt-6", task: "{}" },
			{ agent: "stub-worker", task: JSON.stringify({ say: "fine" }) },
		]),
	);
	const results = toolResults(r)[0].details.results;
	assert.match(results[0].error, /unknown agent "nobody"/);
	assert.match(results[1].error, /unknown tier "gpt-6"/);
	assert.equal(results[2].text, "fine");
});
