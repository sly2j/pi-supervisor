import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadAgents, loadSkillBlock } from "../../extensions/supervisor/agents.ts";
import { buildChildArgs, runChild, writePromptFiles } from "../../extensions/supervisor/dispatch.ts";
import { parse } from "../fixtures/frontmatter.ts";

const PKG = fileURLToPath(new URL("../fixtures/package/", import.meta.url));
const agents = loadAgents(join(PKG, "agents"), parse);
const get = (name: string) => agents.find((a) => a.name === name)!;
const args = (name: string, promptFiles = ["/p/0.md"]) =>
	buildChildArgs({ agent: get(name), model: "p/m", sessionDir: "/s", promptFiles, task: "do it" });
const flag = (a: string[], f: string) => a[a.indexOf(f) + 1];

test("args: base shape per D3", () => {
	assert.deepEqual(args("stub-lead"), [
		"--mode", "json", "-p", "--session-dir", "/s", "--model", "p/m", "--append-system-prompt", "/p/0.md", "Task: do it",
	]);
});

test("args_allowlist: fixer-like agent -> --tools read,edit,write,find,ls,grep,bash", () => {
	const a = args("stub-fixer");
	assert.equal(flag(a, "--tools"), "read,edit,write,find,ls,grep,bash");
	assert.ok(!a.includes("--exclude-tools"));
});

test("args_denylist: worker-like agent -> --exclude-tools edit,dispatch", () => {
	const a = args("stub-worker");
	assert.equal(flag(a, "--exclude-tools"), "edit,dispatch");
	assert.ok(!a.includes("--tools"));
});

test("args_skills: agent with two skills -> three --append-system-prompt files, skill blocks in pi's format", () => {
	const dir = mkdtempSync(join(tmpdir(), "sup-p1-args-"));
	try {
		const files = writePromptFiles(get("stub-worker"), join(PKG, "skills"), dir);
		const a = args("stub-worker", files);
		assert.equal(a.filter((x) => x === "--append-system-prompt").length, 3);
		const text = files.map((f) => readFileSync(f, "utf8"));
		assert.equal(text[0], get("stub-worker").body);
		assert.equal(text[1], loadSkillBlock(join(PKG, "skills"), "stub-skill-a"));
		assert.match(text[2], /^<skill name="stub-skill-b" location="[^"]+SKILL\.md">\nReferences are relative to /);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("args_thinking: thinking xhigh -> --thinking xhigh", () => {
	assert.equal(flag(args("stub-fixer"), "--thinking"), "xhigh");
	assert.ok(!args("stub-worker").includes("--thinking"));
});

test("runChild: a UTF-8 character split across stdout chunks survives", async () => {
	const line = JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "café" }] } });
	const bytes = Buffer.from(`${line}\n`);
	const cut = bytes.indexOf(Buffer.from("é")) + 1;
	const script = `const b = Buffer.from(${JSON.stringify([...bytes])}); process.stdout.write(b.subarray(0, ${cut})); setTimeout(() => process.stdout.write(b.subarray(${cut})), 50);`;
	const r = await runChild({
		invocation: { command: process.execPath, args: ["-e", script] },
		agent: "a",
		model: "p/m",
		cwd: process.cwd(),
		env: process.env,
	});
	assert.equal(r.text, "café");
	assert.equal(r.error, undefined);
});
