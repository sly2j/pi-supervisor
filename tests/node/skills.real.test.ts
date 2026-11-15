// The real skills/ directory loads in pi without a warning (the check P4's checkpoint names).
import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PI, Sandbox } from "../fixtures/harness.ts";

const skip = PI ? false : "pi not on PATH";
const box = new Sandbox();
after(() => box.cleanup());

test("skills_load_clean: real skills copied in, print mode say ok -> reply ok, no skill line on stderr", { skip }, async () => {
	const repo = fileURLToPath(new URL("../../", import.meta.url));
	cpSync(join(repo, "skills"), join(box.pkg, "skills"), { recursive: true });
	const r = await box.run({ say: "ok" });
	assert.equal(r.code, 0, r.stderr);
	const text = r.events.filter((e) => e.type === "message_end" && e.message.role === "assistant").at(-1).message.content[0].text;
	assert.equal(text, "ok");
	assert.ok(!r.stderr.split("\n").some((l) => /skill/i.test(l)), r.stderr);
});
