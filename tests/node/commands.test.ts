// Slice 4: the literal commands, over RPC on the scripted provider.
import assert from "node:assert/strict";
import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PI, Sandbox } from "../fixtures/harness.ts";
import { Rpc } from "../fixtures/rpc.ts";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const skip = PI ? false : "pi not on PATH";
const boxes: Sandbox[] = [];
const rpcs: Rpc[] = [];
const box = () => {
	const b = new Sandbox();
	b.overlay();
	boxes.push(b);
	return b;
};
const rpc = (b: Sandbox, env: Record<string, string> = {}) => (rpcs.push(new Rpc(b, { env })), rpcs.at(-1)!);
after(async () => {
	await Promise.all(rpcs.map((r) => r.close()));
	boxes.forEach((b) => b.cleanup());
});
const gitRepo = (b: Sandbox) => {
	spawnSync("git", ["init", "-q", b.proj]);
	mkdirSync(join(b.proj, "sub", "dir"), { recursive: true });
	return join(b.proj, "sub", "dir");
};

test("close_out_command: '/close-out retry' + echoUser -> reply holds the marker and 'retry'", { skip }, async () => {
	const r = rpc(box());
	await r.waitStatus(/supervisor on/);
	const { from } = await r.prompt('/close-out retry {"echoUser":true}');
	await r.waitFor((e) => e.type === "agent_settled", 30000, from);
	const text = r.lastReply(from);
	assert.match(text, /CLOSE-OUT-MARKER/);
	assert.match(text, /retry/);
});

test("pick_up_command: same with a plan path", { skip }, async () => {
	const r = rpc(box());
	await r.waitStatus(/supervisor on/);
	const { from } = await r.prompt('/pick-up plans/p.md {"echoUser":true}');
	await r.waitFor((e) => e.type === "agent_settled", 30000, from);
	assert.match(r.lastReply(from), /PICK-UP-MARKER[\s\S]*plans\/p\.md/);
});

test("project_backup_command: from a subdirectory -> report block and the repo top level", { skip }, async () => {
	const b = box();
	gitRepo(b);
	const r = rpc(b);
	await r.waitStatus(/supervisor on/);
	// The sandbox cwd is the repo top level; the command must not run in a subdirectory of it.
	const { from } = await r.prompt("/project-backup");
	const n = r.notifications(from).at(-1)!;
	assert.equal(n.type, "info");
	assert.match(n.message, /=== BACKUP REPORT ===/);
	assert.ok(n.message.includes(b.proj));
});

test("project_backup_failure: STUB_EXIT=1 -> error-level notify", { skip }, async () => {
	const b = box();
	gitRepo(b);
	const r = rpc(b, { STUB_EXIT: "1" });
	await r.waitStatus(/supervisor on/);
	const { from } = await r.prompt("/project-backup");
	assert.equal(r.notifications(from).at(-1)!.type, "error");
});

test("meeting_summary_command: echoSystem -> custom message holds the skill marker; child is writer-worker", { skip }, async () => {
	const b = box();
	const r = rpc(b);
	await r.waitStatus(/supervisor on/);
	const { from } = await r.prompt('/meeting-summary {"echoSystem":true}');
	const ev = await r.waitFor((e) => e.type === "message_end" && e.message?.customType === "pi-supervisor-result", 30000, from);
	const content = JSON.stringify(ev.message.content);
	assert.match(content, /MEETING-SUMMARY-MARKER/);
	assert.match(content, /WRITER-WORKER-BODY/);
	assert.ok(b.logRows().some((x) => x.agent === "writer-worker"));
	assert.equal(r.events.slice(from).filter((e) => e.type === "agent_start").length, 0, "no turn started");
});

test("memory_command: status in a git repo without a store -> script output shown", { skip }, async () => {
	const b = box();
	gitRepo(b);
	cpSync(join(REPO, "skills", "project-memory", "scripts", "memory"), join(b.pkg, "skills", "project-memory", "scripts", "memory"), { recursive: true });
	const r = rpc(b);
	await r.waitStatus(/supervisor on/);
	const { from } = await r.prompt("/supervisor-memory status");
	const n = r.notifications(from).at(-1)!;
	assert.match(n.message, /\.supervisor: missing; run `\/supervisor-memory link`/);
	assert.equal(n.type, "error");
});

test("commands_absent_in_child: PI_SUPERVISOR_AGENT set -> '/close-out {echoUser}' reaches the model raw", { skip }, async () => {
	const r = await box().run('/close-out {"echoUser":true}', { PI_SUPERVISOR_AGENT: "x" });
	const text = r.events.filter((e) => e.type === "message_end" && e.message.role === "assistant").at(-1).message.content[0].text;
	assert.equal(text, '/close-out {"echoUser":true}');
});
