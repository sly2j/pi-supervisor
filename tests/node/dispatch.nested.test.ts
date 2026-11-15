// Slice 1b: nesting and guards, on the scripted provider (D17).
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { after, test } from "node:test";
import { dispatchTask, PI, Sandbox, toolResults } from "../fixtures/harness.ts";

const skip = PI ? false : "pi not on PATH";
const boxes: Sandbox[] = [];
const box = () => (boxes.push(new Sandbox()), boxes.at(-1)!);
after(() => boxes.forEach((b) => b.cleanup()));
const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};
const files = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

// main -> stub-lead -> stub-worker and critic in one call
const nestedScript = dispatchTask([
	{
		agent: "stub-lead",
		task: JSON.stringify(
			dispatchTask(
				[
					{ agent: "stub-worker", task: JSON.stringify({ say: "WORKER-TEXT" }) },
					{ agent: "critic", task: JSON.stringify({ say: "CRITIC-TEXT" }) },
				],
				"lead got",
			),
		),
	},
]);

const nested = box();
const nestedRun = nested.run(nestedScript);

test("nested: main -> lead -> worker and critic in one call -> lead result quotes both", { skip }, async () => {
	const r = await nestedRun;
	assert.equal(r.code, 0, r.stderr);
	const [lead] = toolResults(r)[0].details.results;
	assert.equal(lead.agent, "stub-lead");
	assert.equal(lead.model, "scripted/strong");
	assert.match(lead.text, /^lead got: /);
	assert.match(lead.text, /stub-worker \(scripted\/fast\)\n\nWORKER-TEXT/);
	assert.match(lead.text, /critic \(scripted\/standard\)\n\nCRITIC-TEXT/);
});

test("child_profile: every process reports the temporary profile; fake default dir stays empty", { skip }, async () => {
	await nestedRun;
	const rows = nested.logRows();
	assert.deepEqual(rows.map((r) => r.agent).sort(), ["critic", "main", "stub-lead", "stub-worker"]);
	for (const r of rows) assert.equal(r.agentDir, nested.profile, r.agent);
	assert.deepEqual(files(nested.fakeDefault), []);
});

test("sessions: lead and worker JSONL files under <profile>/pi-supervisor/sessions/<parent id>/", { skip }, async () => {
	const r = await nestedRun;
	const mainId = r.events.find((e) => e.type === "session").id;
	const sessions = files(join(nested.profile, "pi-supervisor", "sessions")).filter((f) => f.endsWith(".jsonl"));
	assert.equal(sessions.length, 3, sessions.join("\n"));
	const leadFile = sessions.find((f) => basename(dirname(f)) === mainId);
	assert.ok(leadFile, "lead session under the main session id");
	const leadId = sessions.map((f) => basename(dirname(f))).find((id) => id !== mainId)!;
	assert.equal(sessions.filter((f) => basename(dirname(f)) === leadId).length, 2, "worker and critic under the lead id");
});

test("leaf_has_no_dispatch: stub worker's tool list has no dispatch", { skip }, async () => {
	const r = await box().run(dispatchTask([{ agent: "stub-worker", task: JSON.stringify({ echoTools: true }) }]));
	const tools = toolResults(r)[0].details.results[0].text.split(",");
	assert.ok(tools.includes("read"));
	assert.ok(!tools.includes("dispatch"));
	assert.ok(!tools.includes("edit"));
});

test("depth_cap: PI_SUPERVISOR_DEPTH=2 -> dispatch refuses", { skip }, async () => {
	const r = await box().run(dispatchTask([{ agent: "stub-worker", task: "{}" }]), { PI_SUPERVISOR_DEPTH: "2" });
	const [res] = toolResults(r);
	assert.equal(res.isError, true);
	assert.match(res.content[0].text, /dispatch refused: depth 2/);
});

test("parallel: 6 tasks with a 1 s scripted delay -> wall time under 3 s", { skip }, async () => {
	const tasks = Array.from({ length: 6 }, (_, i) => ({ agent: "stub-worker", task: JSON.stringify({ sleep: 1000, say: `t${i}` }) }));
	const r = await box().run(dispatchTask(tasks));
	const [res] = toolResults(r);
	assert.deepEqual(res.details.results.map((x: any) => x.text), ["t0", "t1", "t2", "t3", "t4", "t5"]);
	assert.ok(res.durationMs < 3000, `dispatch took ${res.durationMs} ms`);
});

test("abort: SIGTERM to main -> no child or grandchild alive after 6 s", { skip }, async () => {
	const s = box();
	const lead = dispatchTask([{ agent: "stub-worker", task: JSON.stringify({ sleep: 60000 }) }]);
	const main = s.start(dispatchTask([{ agent: "stub-lead", task: JSON.stringify(lead) }]));
	const exited = new Promise((ok) => main.on("close", ok));
	const deadline = Date.now() + 20000;
	while (s.logRows().length < 3 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
	const rows = s.logRows();
	assert.deepEqual(rows.map((r) => r.agent), ["main", "stub-lead", "stub-worker"]);
	await new Promise((r) => setTimeout(r, 300)); // let the worker reach its sleep
	main.kill("SIGTERM");
	await new Promise((r) => setTimeout(r, 6000));
	for (const r of rows) assert.equal(alive(r.pid), false, `${r.agent} pid ${r.pid} still alive`);
	await exited;
});
