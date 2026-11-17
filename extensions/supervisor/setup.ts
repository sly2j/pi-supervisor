// /supervisor-config: the tier wizard, status and doctor; plus the first-start offer.
import { existsSync } from "node:fs";
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type Parse, type Tier, TIERS } from "./agents.ts";
import { show } from "./commands.ts";
import { formatChecks, runChecks } from "./doctor.ts";
import type { Invocation } from "./dispatch.ts";
import { ENTRY, type Persona, parseModelRef, personaState } from "./persona.ts";
import { pickLabel } from "./picker.ts";
import { type Config, CONFIG_FILE, loadConfig } from "./tiers.ts";

export type TierMap = Record<Tier, string>;
export type Exec = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
export type SetupDeps = {
	root: string;
	agentDir: () => string;
	parse: Parse;
	piVersion: string;
	persona: Persona;
	invocation: (args: string[]) => Invocation;
};

const ROLES: Record<Tier, string> = {
	top: "supervisor, writer, scope-critic",
	strong: "planner, researcher, critic, writer-worker",
	standard: "executor, curator, other workers",
	fast: "fixer, git-ops, scout",
};
// The closing summary is saved in the session and shown at the next session_start, after the reload
// has redrawn the screen; a second entry marks it shown, so it appears once.
const PENDING = "pi-supervisor-summary";
const SHOWN = "pi-supervisor-summary-shown";
const WEB_SOURCE = "npm:pi-web-access";
export const NO_MODELS =
	"No models with credentials. Log in with /login (for example a ChatGPT or Claude subscription) or set a provider key such as OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY, restart pi-supervisor, then run /supervisor-config again.";
const ANTHROPIC_NOTICE =
	"Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at https://claude.ai/settings/usage.";

const byPrice = (a: Model<Api>, b: Model<Api>) =>
	b.cost.output - a.cost.output || b.cost.input - a.cost.input || a.id.localeCompare(b.id);
const ref = (m: Model<Api>) => `${m.provider}/${m.id}`;
const price = (m: Model<Api>) => `$${m.cost.input}/$${m.cost.output} per M`;

// One provider's models, dearest first, spread over the four tiers (D3).
export function proposeTiers(models: Model<Api>[], preferProvider?: string): TierMap {
	const count = new Map<string, number>();
	for (const m of models) count.set(m.provider, (count.get(m.provider) ?? 0) + 1);
	const provider = preferProvider && count.has(preferProvider)
		? preferProvider
		: [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b))[0];
	const mine = models.filter((m) => m.provider === provider).sort(byPrice);
	const n = mine.length;
	return Object.fromEntries(TIERS.map((t, i) => [t, ref(mine[Math.round((i * (n - 1)) / 3)])])) as TierMap;
}

// Every available model, other providers' first (a second family catches different mistakes), dearest first.
export function criticChoices(models: Model<Api>[], topProvider: string): Model<Api>[] {
	const other = (m: Model<Api>) => (m.provider === topProvider ? 1 : 0);
	return [...models].sort((a, b) => other(a) - other(b) || byPrice(a, b));
}

export const NO_CRITIC = "None: the critic agent uses its tier";

// Critic picks: the current one first ("Keep"), then none, then the other providers' models.
type Option = { label: string; value: string | null };
export function criticOptions(models: Option[], current: string | null): Option[] {
	const keep = current ? [{ label: `Keep ${current}`, value: current }] : [];
	return [...keep, { label: NO_CRITIC, value: null }, ...models.filter((m) => m.value !== current)];
}

// Four lines (tier, model, price, roles) and a note when tiers share a model. A model that is not
// among the available ones shows "(no credentials)" in place of its price.
export function describeTiers(t: TierMap, models: Model<Api>[]): string {
	const lines = TIERS.map((tier) => {
		const r = parseModelRef(t[tier]);
		const m = models.find((x) => x.provider === r.provider && x.id === r.id);
		return `${tier.padEnd(9)}${t[tier].padEnd(36)}${(m ? price(m) : "(no credentials)").padEnd(20)}${ROLES[tier]}`;
	});
	const k = new Set(TIERS.map((x) => t[x])).size;
	if (k < 4) lines.push(`Only ${k} distinct model${k === 1 ? "" : "s"}; some tiers share one.`);
	return lines.join("\n");
}

// Temporary file and rename, then read back, so a written file is always valid.
export function writeConfig(agentDir: string, c: Config): void {
	const file = join(agentDir, CONFIG_FILE);
	const tmp = `${file}.tmp-${process.pid}`;
	writeFileSync(tmp, `${JSON.stringify(c, null, 2)}\n`);
	renameSync(tmp, file);
	loadConfig(agentDir);
}

// Runs pi's own `install <source>`; PI_CODING_AGENT_DIR from the launcher keeps it in the profile.
export async function installWeb(
	exec: Exec,
	invocation: (args: string[]) => Invocation,
	source = WEB_SOURCE,
): Promise<{ ok: boolean; output: string }> {
	const inv = invocation(["install", source]);
	try {
		const r = await exec(inv.command, inv.args);
		return { ok: r.code === 0, output: `${r.stdout}\n${r.stderr}`.trim().split("\n").slice(-8).join("\n") };
	} catch (e) {
		return { ok: false, output: (e as Error).message };
	}
}

export function registerSetup(pi: ExtensionAPI, d: SetupDeps): void {
	const file = () => join(d.agentDir(), CONFIG_FILE);
	const readConfig = (): Config | null | Error => {
		try {
			return loadConfig(d.agentDir());
		} catch (e) {
			return e as Error;
		}
	};
	const hasWeb = () => ["web_search", "fetch_content"].every((n) => pi.getAllTools().some((t) => t.name === n));
	const onPath = (cmd: string) => {
		try {
			execFileSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" });
			return true;
		} catch {
			return false;
		}
	};

	function deliver(ctx: ExtensionContext): void {
		const entries = ctx.sessionManager.getEntries() as { type: string; customType?: string; data?: { text: string; level: "info" | "warning" } }[];
		const at = (t: string) => entries.findLastIndex((x) => x.type === "custom" && x.customType === t);
		const i = at(PENDING);
		if (i < 0 || at(SHOWN) > i) return;
		pi.appendEntry(SHOWN, {});
		show(ctx, entries[i].data!.text, entries[i].data!.level);
	}

	pi.on("session_start", (e, ctx) => {
		deliver(ctx);
		if (e.reason !== "startup" || !ctx.hasUI || existsSync(file())) return;
		ctx.ui.notify("Supervisor for Pi is not set up yet. Press Enter to choose its models.", "info");
		ctx.ui.setEditorText("/supervisor-config");
	});

	function doctor(ctx: ExtensionCommandContext): string {
		const checks = runChecks({
			piVersion: d.piVersion,
			nodeVersion: process.version,
			agentDir: d.agentDir(),
			root: d.root,
			find: (p, id) => ctx.modelRegistry.find(p, id),
			hasAuth: (m) => ctx.modelRegistry.hasConfiguredAuth(m),
			tools: pi.getAllTools().map((t) => t.name),
			onPath,
			parse: d.parse,
		});
		return formatChecks(checks);
	}

	function status(): string {
		const c = readConfig();
		const lines = [`Config: ${file()}`];
		if (c === null) lines.push("Not set up yet. Run /supervisor-config.");
		else if (c instanceof Error) lines.push(`Invalid: ${c.message}`, "Fix the file or run /supervisor-config.");
		else {
			for (const t of TIERS) lines.push(`${t.padEnd(9)}${c.tiers[t].padEnd(36)}${ROLES[t]}`);
			lines.push(`critic   ${c.critic ?? "none (the critic agent uses its tier)"}`);
		}
		lines.push(`Persona: ${d.persona.status()}`);
		lines.push(`Web tools: ${hasWeb() ? "active" : "not active (/supervisor-config offers pi-web-access)"}`);
		return lines.join("\n");
	}

	async function wizard(ctx: ExtensionCommandContext): Promise<void> {
		const ui = ctx.ui;
		const cancelled = () => show(ctx, "Setup cancelled; nothing was changed.");
		const avail = ctx.modelRegistry.getAvailable();
		if (!avail.length) return show(ctx, NO_MODELS, "error");
		const existing = readConfig();
		let tiers: TierMap = existing && !(existing instanceof Error) ? existing.tiers : proposeTiers(avail, ctx.model?.provider);
		const providers = [...new Set(avail.map((m) => m.provider))].sort();
		const label = (m: Model<Api>) => `${ref(m)}  ${price(m)}`;

		for (;;) {
			const options = ["Accept", ...TIERS.map((t) => `Change ${t}`)];
			if (providers.length > 1) options.push("Use another provider");
			options.push("Cancel");
			const pick = await ui.select(`Supervisor models\n${describeTiers(tiers, avail)}`, options);
			if (pick === undefined || pick === "Cancel") return cancelled();
			if (pick === "Accept") break;
			if (pick === "Use another provider") {
				const p = await ui.select("Provider", providers);
				if (p === undefined) return cancelled();
				tiers = proposeTiers(avail, p);
				continue;
			}
			const tier = pick.slice("Change ".length) as Tier;
			const sorted = [...avail].sort(byPrice);
			const m = await pickLabel(ctx, `Model for ${tier} (${ROLES[tier]})`, sorted.map(label));
			if (m === undefined) return cancelled();
			tiers = { ...tiers, [tier]: ref(sorted[sorted.map(label).indexOf(m)]) };
		}

		// A re-run offers the current critic first; Escape cancels, as in every other step.
		let critic = existing && !(existing instanceof Error) ? existing.critic : null;
		const others = criticChoices(avail, parseModelRef(tiers.top).provider);
		if (providers.length > 1 && others.length > 0) {
			const opts = criticOptions(others.map((m) => ({ label: label(m), value: ref(m) })), critic);
			const c = await pickLabel(
				ctx,
				"Critic model\nReview with a model from another provider than the top tier? A second model family catches different mistakes.",
				opts.map((o) => o.label),
			);
			if (c === undefined) return cancelled();
			critic = opts.find((o) => o.label === c)!.value;
		}

		let web = "";
		let level: "info" | "warning" = "info";
		if (!hasWeb()) {
			const yes = await ui.confirm("Web tools", "Install pi-web-access for web_search and fetch_content? It goes into the pi-supervisor profile only.");
			if (yes) {
				const r = await installWeb((c, a) => pi.exec(c, a), d.invocation);
				web = (r.ok ? "Installed pi-web-access; it is active after the reload." : `pi-web-access did not install; setup goes on without it.\n${r.output}`) + "\n\n";
				if (!r.ok) level = "warning";
			}
		}

		const chosen = [...new Set([...TIERS.map((t) => tiers[t]), ...(critic ? [critic] : [])])];
		for (const c of chosen) {
			const r = parseModelRef(c);
			const m = avail.find((x) => x.provider === r.provider && x.id === r.id);
			if (m && m.provider === "anthropic" && ctx.modelRegistry.isUsingOAuth(m)) {
				show(ctx, ANTHROPIC_NOTICE, "warning");
				break;
			}
		}

		writeConfig(d.agentDir(), { version: 1, tiers, critic });
		// Finishing setup turns the persona on, also after /supervisor off.
		if (!personaState(ctx.sessionManager.getEntries() as never).on) pi.appendEntry(ENTRY, { on: true });
		// The reload redraws the screen, so the summary is shown at the session_start after it.
		pi.appendEntry(PENDING, { text: `${web}Supervisor is on. Top tier: ${tiers.top}.\n\n${doctor(ctx)}`, level });
		try {
			await ctx.reload();
		} catch {
			// The reload failed: show it now if ctx still works, else at this session's next start.
			try {
				deliver(ctx);
			} catch {}
		}
	}

	pi.registerCommand("supervisor-config", {
		description: "Set up the model tiers: /supervisor-config [status | doctor]",
		handler: async (args, ctx) => {
			const arg = args.trim();
			if (arg === "status") return show(ctx, status());
			if (arg === "doctor") return show(ctx, doctor(ctx));
			if (arg !== "") return show(ctx, "Usage: /supervisor-config [status | doctor]", "warning");
			if (!ctx.hasUI)
				return show(ctx, `The setup wizard needs the interactive TUI; write ${file()} by hand (see /supervisor-config status).`, "warning");
			await wizard(ctx);
		},
	});
}
