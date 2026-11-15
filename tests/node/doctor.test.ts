import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type DoctorDeps, formatChecks, runChecks } from "../../extensions/supervisor/doctor.ts";
import { parse } from "../fixtures/frontmatter.ts";

const tiers = { top: "p/top-1", strong: "p/strong-1", standard: "p/standard-1", fast: "anthropic/claude-haiku-4-5" };

// A temp agentDir (with config) and package root (with agents/supervisor.md), removed after fn.
function withEnv(fn: (d: DoctorDeps, dir: string, root: string) => void, opts: { config?: string | null; agent?: boolean } = {}) {
	const dir = mkdtempSync(join(tmpdir(), "sup-doctor-"));
	try {
		const agentDir = join(dir, "agent");
		const root = join(dir, "root");
		mkdirSync(agentDir);
		mkdirSync(join(root, "agents"), { recursive: true });
		const config = opts.config === undefined ? JSON.stringify({ version: 1, tiers, critic: null }) : opts.config;
		if (config !== null) writeFileSync(join(agentDir, "pi-supervisor.json"), config);
		if (opts.agent !== false) writeFileSync(join(root, "agents", "supervisor.md"), "---\nname: supervisor\ndescription: d\ntier: top\n---\nbody\n");
		const d: DoctorDeps = {
			piVersion: "1.5.2",
			nodeVersion: "v22.19.0",
			agentDir,
			root,
			find: (provider, id) => ({ provider, id }) as any,
			hasAuth: () => true,
			tools: ["web_search", "fetch_content"],
			onPath: () => true,
			parse,
		};
		fn(d, agentDir, root);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const find = (cs: ReturnType<typeof runChecks>, name: string) => cs.find((c) => c.name === name)!;

test("doctor_all_pass: fake deps, all ready -> no FAIL; summary \"0 FAIL, 0 WARN\"", () => {
	withEnv((d) => {
		const cs = runChecks(d);
		assert.ok(!cs.some((c) => c.level === "FAIL"));
		assert.ok(formatChecks(cs).endsWith("\n0 FAIL, 0 WARN"));
	});
});

test("doctor_tier_not_ready: fast has no credentials -> FAIL line with the exact detail above", () => {
	withEnv((d) => {
		const c = find(runChecks({ ...d, hasAuth: (m) => m.id !== "claude-haiku-4-5" }), "tier fast");
		assert.equal(c.level, "FAIL");
		assert.equal(c.detail, "tier fast: anthropic/claude-haiku-4-5 has no credentials; /login, set the provider key, or remap it with /supervisor-config");
	});
});

test("doctor_tier_unknown_model: find returns nothing -> FAIL", () => {
	withEnv((d) => {
		const c = find(runChecks({ ...d, find: () => undefined }), "tier fast");
		assert.equal(c.detail, "tier fast: anthropic/claude-haiku-4-5 has no model of that name; remap it with /supervisor-config");
	});
});

test("doctor_missing_config -> FAIL naming /supervisor-config", () => {
	withEnv((d) => {
		const c = find(runChecks(d), "config");
		assert.equal(c.level, "FAIL");
		assert.match(c.detail, /\/supervisor-config/);
	}, { config: null });
});

test("doctor_invalid_config -> FAIL with the error and /supervisor-config", () => {
	withEnv((d) => {
		const c = find(runChecks(d), "config");
		assert.equal(c.level, "FAIL");
		assert.match(c.detail, /pi-supervisor\.json.*not valid JSON.*; run \/supervisor-config$/);
	}, { config: "{nope" });
});

test("doctor_web_pending: settings.json lists npm:pi-web-access, tool absent -> WARN \"active after /reload\"", () => {
	withEnv((d, agentDir) => {
		const absent = { ...d, tools: [] };
		assert.equal(find(runChecks(absent), "web tools").detail, "run /supervisor-config");
		writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ packages: [{ source: "npm:pi-web-access" }] }));
		const c = find(runChecks(absent), "web tools");
		assert.equal(c.level, "WARN");
		assert.match(c.detail, /active after \/reload/);
		writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ packages: ["npm:pi-web-access"] }));
		assert.match(find(runChecks(absent), "web tools").detail, /active after \/reload/);
	});
});

test("doctor_old_versions: old pi and old node -> FAIL", () => {
	withEnv((d) => {
		const cs = runChecks({ ...d, piVersion: "1.4.9", nodeVersion: "v22.18.1" });
		assert.equal(find(cs, "pi version").level, "FAIL");
		assert.equal(find(cs, "node version").level, "FAIL");
	});
});

test("doctor_missing_zip: zip not on PATH -> WARN", () => {
	withEnv((d) => {
		const c = find(runChecks({ ...d, onPath: (cmd) => cmd !== "zip" }), "zip");
		assert.equal(c.level, "WARN");
		assert.match(c.detail, /^not on PATH; /);
	});
});

test("doctor_missing_supervisor: no supervisor.md -> FAIL", () => {
	withEnv((d) => {
		assert.equal(find(runChecks(d), "agents").level, "FAIL");
	}, { agent: false });
});
