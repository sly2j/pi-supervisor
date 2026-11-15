// Slice 1: the supervisor persona in the main session, on the scripted provider.
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { loadAgents } from "../../extensions/supervisor/agents.ts";
import { parseModelRef, personaState, personaTools } from "../../extensions/supervisor/persona.ts";
import { dispatchTask, PI, Sandbox, toolResults } from "../fixtures/harness.ts";
import { parse } from "../fixtures/frontmatter.ts";
import { Rpc } from "../fixtures/rpc.ts";

const skip = PI ? false : "pi not on PATH";
const boxes: Sandbox[] = [];
const rpcs: Rpc[] = [];
const box = (...a: ConstructorParameters<typeof Sandbox>) => {
	const b = new Sandbox(...a);
	b.overlay();
	boxes.push(b);
	return b;
};
const rpc = (b: Sandbox, model: string | null = "scripted/top") => (rpcs.push(new Rpc(b, { model })), rpcs.at(-1)!);
after(async () => {
	await Promise.all(rpcs.map((r) => r.close()));
	boxes.forEach((b) => b.cleanup());
});
const names = (e: string) => e.split(",");
const modelOf = (state: any) => `${state.model.provider}/${state.model.id}`;

test("persona_tools: supervisor tools list, registered [read,bash,edit,write,grep,find,ls,dispatch] -> no bash", () => {
	const def = loadAgents(join(import.meta.dirname, "../fixtures/p2/agents"), parse).find((a) => a.name === "supervisor")!;
	assert.deepEqual(personaTools(def, ["read", "bash", "edit", "write", "grep", "find", "ls", "dispatch"]), [
		"read", "edit", "write", "grep", "find", "ls", "dispatch",
	]);
});

test("parse_model_ref: bedrock id kept whole, trailing thinking level split off", () => {
	assert.deepEqual(parseModelRef("amazon-bedrock/a.b:v1:0"), { provider: "amazon-bedrock", id: "a.b:v1:0" });
	assert.deepEqual(parseModelRef("openai/x:high"), { provider: "openai", id: "x", thinking: "high" });
});

test("persona_state: latest entry wins, default on", () => {
	const e = (data: object) => ({ type: "custom", customType: "pi-supervisor-persona", data });
	assert.deepEqual(personaState([]), { on: true });
	assert.deepEqual(personaState([e({ on: true }), e({ on: false }), { type: "message" }]), { on: false });
});

test("persona_on: print mode on scripted/strong -> reply from scripted/top with the body, no bash", { skip }, async () => {
	const s = box();
	const sys = await s.run({ echoSystem: true }, {}, 60000, "scripted/strong");
	assert.equal(sys.code, 0, sys.stderr);
	const m = sys.events.filter((e) => e.type === "message_end" && e.message.role === "assistant").at(-1).message;
	assert.equal(`${m.provider}/${m.model}`, "scripted/top");
	assert.ok(m.content[0].text.includes("SUPERVISOR-BODY-MARKER"));
	const t = await s.run({ echoTools: true }, {}, 60000, "scripted/strong");
	const tools = names(t.events.filter((e) => e.type === "message_end" && e.message.role === "assistant").at(-1).message.content[0].text);
	assert.ok(!tools.includes("bash"));
	assert.ok(tools.includes("dispatch") && tools.includes("grep"), tools.join());
});

test("persona_off: /supervisor off -> model strong, bash active, no body", { skip }, async () => {
	const r = rpc(box(), "scripted/strong");
	await r.waitStatus(/supervisor on/);
	assert.equal(modelOf(await r.state()), "scripted/top");
	await r.prompt("/supervisor off");
	assert.equal(modelOf(await r.state()), "scripted/strong");
	assert.ok(names(await r.ask({ echoTools: true })).includes("bash"));
	assert.ok(!(await r.ask({ echoSystem: true })).includes("SUPERVISOR-BODY-MARKER"));
	await r.prompt("/supervisor on");
	assert.equal(modelOf(await r.state()), "scripted/top");
	assert.ok((await r.ask({ echoSystem: true })).includes("SUPERVISOR-BODY-MARKER"));
	assert.equal(r.unexpected.length, 0);
});

test("persona_off_survives_reload: /supervisor off, /test-reload -> model still strong", { skip }, async () => {
	const r = rpc(box(), "scripted/strong");
	await r.waitStatus(/supervisor on/);
	await r.prompt("/supervisor off");
	await r.prompt("/test-reload");
	await r.waitStatus(/supervisor off/);
	assert.equal(modelOf(await r.state()), "scripted/strong");
	assert.ok(names(await r.ask({ echoTools: true })).includes("bash"));
});

test("persona_on_reload_then_off: started on strong, reload while on, off -> strong, bash active", { skip }, async () => {
	const r = rpc(box(), "scripted/strong");
	await r.waitStatus(/supervisor on/);
	await r.prompt("/test-reload");
	await r.state();
	assert.equal(modelOf(await r.state()), "scripted/top");
	await r.prompt("/supervisor off");
	assert.equal(modelOf(await r.state()), "scripted/strong");
	assert.ok(names(await r.ask({ echoTools: true })).includes("bash"));
});

test("persona_absent_in_child: dispatched child has no persona body and keeps its tools", { skip }, async () => {
	const s = box();
	const r = await s.run(dispatchTask([{ agent: "stub-worker", task: JSON.stringify({ echoSystem: true }) }]));
	const [res] = toolResults(r);
	assert.ok(!res.details.results[0].text.includes("SUPERVISOR-BODY-MARKER"));
	const t = await s.run(dispatchTask([{ agent: "stub-worker", task: JSON.stringify({ echoTools: true }) }]));
	const tools = names(toolResults(t)[0].details.results[0].text);
	assert.ok(tools.includes("bash") && !tools.includes("dispatch"));
});

test("no_config: no file -> status 'not set up', model unchanged, bash active", { skip }, async () => {
	const s = box();
	rmSync(join(s.profile, "pi-supervisor.json"));
	const r = rpc(s, "scripted/strong");
	assert.match(await r.waitStatus(/not set up/), /\/supervisor-config/);
	assert.equal(modelOf(await r.state()), "scripted/strong");
	assert.ok(names(await r.ask({ echoTools: true })).includes("bash"));
});

test("invalid_config: version 2 -> persona off, status names the problem", { skip }, async () => {
	const s = box();
	const { writeFileSync } = await import("node:fs");
	writeFileSync(join(s.profile, "pi-supervisor.json"), JSON.stringify({ version: 2 }));
	const r = rpc(s, "scripted/strong");
	assert.match(await r.waitStatus(/invalid config/), /version must be 1.*doctor/);
	assert.equal(modelOf(await r.state()), "scripted/strong");
});

test("top_no_credentials: top on anthropic without a key -> persona off, status names doctor", { skip }, async () => {
	const r = rpc(box({ top: "anthropic/claude-haiku-4-5" }), "scripted/strong");
	assert.match(await r.waitStatus(/no credentials/), /anthropic\/claude-haiku-4-5.*doctor/);
	assert.equal(modelOf(await r.state()), "scripted/strong");
	assert.ok(names(await r.ask({ echoTools: true })).includes("bash"));
});

test("persona_on_twice_then_off: on while on keeps the original -> off restores strong", { skip }, async () => {
	const r = rpc(box(), "scripted/strong");
	await r.waitStatus(/supervisor on/);
	await r.prompt("/supervisor on");
	await r.prompt("/supervisor off");
	assert.equal(modelOf(await r.state()), "scripted/strong");
	assert.ok(names(await r.ask({ echoTools: true })).includes("bash"));
});

test("persona_config_lost_on_reload: config removed, reload, off -> original restored", { skip }, async () => {
	const s = box();
	const r = rpc(s, "scripted/strong");
	await r.waitStatus(/supervisor on/);
	rmSync(join(s.profile, "pi-supervisor.json"));
	await r.prompt("/test-reload");
	await r.waitStatus(/not set up/);
	assert.equal(modelOf(await r.state()), "scripted/strong");
	assert.ok(names(await r.ask({ echoTools: true })).includes("bash"));
});
