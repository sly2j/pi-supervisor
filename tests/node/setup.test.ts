// Slices 2 and 3: /supervisor-config status, doctor and the wizard, over RPC on the scripted provider.
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { criticChoices, criticOptions, installWeb, NO_CRITIC, proposeTiers } from "../../extensions/supervisor/setup.ts";
import { PI, Sandbox } from "../fixtures/harness.ts";
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
const cfg = (b: Sandbox) => JSON.parse(readFileSync(join(b.profile, "pi-supervisor.json"), "utf8"));
const model = (provider: string, id: string, input: number, output: number) => ({ provider, id, cost: { input, output } }) as never;

// Slice 2

test("status_command: four tiers with roles, critic none, persona on", { skip }, async () => {
	const r = rpc(box());
	await r.waitStatus(/supervisor on/);
	const { from } = await r.prompt("/supervisor-config status");
	const text = r.notifications(from).map((n) => n.message).join("\n");
	for (const t of ["top", "strong", "standard", "fast"]) assert.match(text, new RegExp(`${t}\\s+scripted/${t}\\s+\\S`));
	assert.match(text, /critic\s+none/);
	assert.match(text, /Persona: supervisor on/);
});

test("doctor_tier_not_ready: fast on anthropic without a key -> FAIL line names tier fast and /login", { skip }, async () => {
	const r = rpc(box({ fast: "anthropic/claude-haiku-4-5" }));
	await r.waitStatus(/fast has no credentials/);
	const { from } = await r.prompt("/supervisor-config doctor");
	const text = r.notifications(from).map((n) => n.message).join("\n");
	assert.match(text, /FAIL\s+tier fast\s+tier fast: anthropic\/claude-haiku-4-5 has no credentials; \/login/);
	assert.match(text, /1 FAIL/);
	assert.doesNotMatch(text, /pi version\s+.*FAIL/);
});

// Slice 3

test("propose_four: 5 priced models of one provider -> 4 distinct tiers, highest price on top", () => {
	const ms = [1, 2, 3, 4, 5].map((i) => model("p", `m${i}`, i, i * 5));
	assert.deepEqual(proposeTiers(ms), { top: "p/m5", strong: "p/m4", standard: "p/m2", fast: "p/m1" });
});

test("propose_two: 2 models -> top = strong = dearer, standard = fast = cheaper", () => {
	const ms = [model("p", "a", 1, 5), model("p", "b", 2, 10)];
	assert.deepEqual(proposeTiers(ms), { top: "p/b", strong: "p/b", standard: "p/a", fast: "p/a" });
});

test("propose_prefers_current: two providers, session on the smaller -> its models", () => {
	const ms = [model("a", "1", 1, 1), model("a", "2", 2, 2), model("b", "x", 1, 1)];
	assert.equal(proposeTiers(ms, "b").top, "b/x");
	assert.equal(proposeTiers(ms).top, "a/2");
});

test("critic_choices: two providers -> only the other provider's models, dearest first", () => {
	const ms = [model("a", "1", 1, 1), model("b", "x", 1, 1), model("b", "y", 3, 3)];
	assert.deepEqual(criticChoices(ms, "a").map((m: any) => m.id), ["y", "x"]);
});

test("critic_options: first run -> none first; re-run -> keep current first, not listed twice", () => {
	const ms = [{ label: "b/y  $3/$3 per M", value: "b/y" }, { label: "b/x  $1/$1 per M", value: "b/x" }];
	assert.deepEqual(criticOptions(ms, null).map((o) => o.value), [null, "b/y", "b/x"]);
	const re = criticOptions(ms, "b/x");
	assert.deepEqual(re.map((o) => o.value), ["b/x", null, "b/y"]);
	assert.equal(re[0].label, "Keep b/x");
	assert.equal(re[1].label, NO_CRITIC);
});

test("no_models: no provider with credentials -> error notify with /login hint, no file", { skip }, async () => {
	const s = box();
	s.noModels();
	rmSync(join(s.profile, "pi-supervisor.json"));
	const r = rpc(s, null);
	const { from } = await r.prompt("/supervisor-config");
	const n = r.notifications(from);
	assert.equal(n.at(-1)?.type, "error");
	assert.match(n.at(-1)!.message, /No models with credentials\. Log in with \/login/);
	assert.ok(!existsSync(join(s.profile, "pi-supervisor.json")));
});

// The wizard proposal on the scripted provider; any dialog not queued by a test is a failure.
const wizard = (r: Rpc, ...steps: ["select" | "confirm", RegExp | undefined, object][]) =>
	steps.forEach(([m, t, reply]) => r.answer(m, t, reply));

test("wizard_writes_config: Accept, no critic, no web -> file, reload, persona on", { skip }, async () => {
	const s = box();
	rmSync(join(s.profile, "pi-supervisor.json"));
	const r = rpc(s, "scripted/strong");
	await r.waitFor((e) => e.method === "set_editor_text");
	assert.equal(r.requests.find((e) => e.method === "set_editor_text").text, "/supervisor-config");
	assert.match(r.notifications().map((n) => n.message).join(), /not set up yet. Press Enter/);
	wizard(r, ["select", /Supervisor models/, { value: "Accept" }], ["confirm", /Web tools/, { confirmed: false }]);
	await r.prompt("/supervisor-config");
	assert.deepEqual(cfg(s), {
		version: 1,
		tiers: { top: "scripted/top", strong: "scripted/strong", standard: "scripted/standard", fast: "scripted/fast" },
		critic: null,
	});
	await r.waitStatus(/supervisor on/);
	const text = r.notifications().map((n) => n.message).join("\n");
	assert.match(text, /Supervisor is on\. Top tier: scripted\/top\.\n\n(.|\n)*0 FAIL/);
	assert.equal((await r.state()).model.id, "top");
	assert.equal(r.unexpected.length, 0, JSON.stringify(r.unexpected));
});

test("wizard_summary_once: summary comes after the reload, once, not on later reloads or new sessions", { skip }, async () => {
	const s = box();
	rmSync(join(s.profile, "pi-supervisor.json"));
	const r = rpc(s, "scripted/strong");
	wizard(r, ["select", /Supervisor models/, { value: "Accept" }], ["confirm", /Web tools/, { confirmed: false }]);
	await r.prompt("/supervisor-config");
	const isSummary = (e: any) => e.method === "notify" && /Supervisor is on\. Top tier/.test(e.message);
	await r.waitFor(isSummary);
	const summaries = () => r.events.filter(isSummary).length;
	const reloadAt = r.events.findIndex((e) => e.method === "setStatus" && /supervisor on/.test(e.statusText ?? ""));
	assert.ok(reloadAt >= 0 && r.events.findIndex(isSummary) > reloadAt, "summary is shown after the reload redraw, not before");
	assert.equal(summaries(), 1);
	await r.prompt("/test-reload");
	await r.request({ type: "new_session" });
	await r.prompt("/test-reload");
	assert.equal(summaries(), 1);
	assert.equal(r.unexpected.length, 0, JSON.stringify(r.unexpected));
});

test("wizard_change_tier: Change fast -> pick standard -> file fast scripted/standard", { skip }, async () => {
	const s = box();
	rmSync(join(s.profile, "pi-supervisor.json"));
	const r = rpc(s);
	wizard(
		r,
		["select", /Supervisor models/, { value: "Change fast" }],
		["select", /Model for fast/, { value: "scripted/standard  $2/$10 per M" }],
		["select", /Supervisor models/, { value: "Accept" }],
		["confirm", /Web tools/, { confirmed: false }],
	);
	await r.prompt("/supervisor-config");
	assert.equal(cfg(s).tiers.fast, "scripted/standard");
	assert.equal(r.unexpected.length, 0, JSON.stringify(r.unexpected));
});

test("wizard_cancel: cancel at the proposal -> no file, nothing changed", { skip }, async () => {
	const s = box();
	rmSync(join(s.profile, "pi-supervisor.json"));
	const r = rpc(s);
	wizard(r, ["select", /Supervisor models/, { cancelled: true }]);
	const { from } = await r.prompt("/supervisor-config");
	assert.match(r.notifications(from).at(-1)!.message, /Setup cancelled; nothing was changed\./);
	assert.ok(!existsSync(join(s.profile, "pi-supervisor.json")));
});

test("wizard_rerun_uses_config: fast on anthropic without a key -> proposal shows it as (no credentials)", { skip }, async () => {
	const s = box({ fast: "anthropic/claude-haiku-4-5" });
	const r = rpc(s);
	let title = "";
	r.answer("select", /Supervisor models/, (req) => ((title = req.title), { cancelled: true }));
	await r.prompt("/supervisor-config");
	assert.match(title, /fast\s+anthropic\/claude-haiku-4-5\s+\(no credentials\)/);
	assert.match(title, /top\s+scripted\/top\s+\$8\/\$40 per M/);
});

test("web_install_profile_only: installWeb on the web stub -> profile settings lists it, fake default untouched", { skip }, async () => {
	const s = box();
	const before = readFileSync(join(s.profile, "settings.json"), "utf8");
	const exec = async (cmd: string, args: string[]) => {
		const r = spawnSync(cmd, args, { env: s.env(), cwd: s.proj, encoding: "utf8" });
		return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
	};
	const r = await installWeb(exec, (a) => ({ command: PI, args: a }), s.webStub);
	assert.equal(r.ok, true, r.output);
	assert.notEqual(readFileSync(join(s.profile, "settings.json"), "utf8"), before);
	assert.ok(readFileSync(join(s.profile, "settings.json"), "utf8").includes(s.webStub));
	assert.ok(!existsSync(join(s.fakeDefault, "settings.json")), "nothing written to the default agent dir");
});

test("wizard_after_off: /supervisor off, then setup -> persona on again", { skip }, async () => {
	const s = box();
	const r = rpc(s, "scripted/strong");
	await r.waitStatus(/supervisor on/);
	await r.prompt("/supervisor off");
	wizard(r, ["select", /Supervisor models/, { value: "Accept" }], ["confirm", /Web tools/, { confirmed: false }]);
	await r.prompt("/supervisor-config");
	await r.waitStatus(/supervisor on/);
	assert.equal((await r.state()).model.id, "top");
});

test("wizard_rerun_keeps_critic: second provider, Accept, default pick -> critic kept", { skip }, async () => {
	const s = box({}, "anthropic/claude-haiku-4-5");
	// A dummy key makes anthropic a second provider with credentials; nothing calls a model.
	const r = new Rpc(s, { model: "scripted/strong", env: { ANTHROPIC_API_KEY: "dummy-test-key" } });
	rpcs.push(r);
	let opts: string[] = [];
	wizard(r, ["select", /Supervisor models/, { value: "Accept" }], ["confirm", /Web tools/, { confirmed: false }]);
	r.answer("select", /Critic model/, (req) => ((opts = req.options), { value: req.options[0] }));
	await r.prompt("/supervisor-config");
	assert.equal(opts[0], "Keep anthropic/claude-haiku-4-5");
	assert.equal(cfg(s).critic, "anthropic/claude-haiku-4-5");
	assert.equal(r.unexpected.length, 0, JSON.stringify(r.unexpected));
});
