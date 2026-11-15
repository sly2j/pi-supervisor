// /supervisor-config doctor: readiness checks. Host-free; the host supplies everything through DoctorDeps.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { loadAgents, type Parse, TIERS } from "./agents.ts";
import { parseModelRef } from "./persona.ts";
import { CONFIG_FILE, loadConfig } from "./tiers.ts";

export type Check = { level: "PASS" | "WARN" | "FAIL"; name: string; detail: string };
export type DoctorDeps = {
	piVersion: string;
	nodeVersion: string;
	agentDir: string;
	root: string;
	find(provider: string, id: string): Model<Api> | undefined;
	hasAuth(m: Model<Api>): boolean;
	tools: string[];
	onPath(cmd: string): boolean;
	parse: Parse;
};

const MIN_PI = [1, 5, 2];
const MIN_NODE = [22, 19];
const NEEDS: Record<string, string> = {
	python3: "the memory script needs it",
	git: "the git-ops and close-out work need it",
	zip: "/project-backup needs it",
};

const nums = (v: string) => v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
function atLeast(v: string, min: number[]): boolean {
	const a = nums(v);
	for (let i = 0; i < min.length; i++) if ((a[i] ?? 0) !== min[i]) return (a[i] ?? 0) > min[i];
	return true;
}

function webPending(agentDir: string): boolean {
	try {
		const pkgs = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")).packages;
		return Array.isArray(pkgs) && pkgs.some((p) => p === "npm:pi-web-access" || p?.source === "npm:pi-web-access");
	} catch {
		return false;
	}
}

export function runChecks(d: DoctorDeps): Check[] {
	const out: Check[] = [];
	const add = (ok: boolean, name: string, pass: string, fail: string, bad: Check["level"] = "FAIL") =>
		out.push({ level: ok ? "PASS" : bad, name, detail: ok ? pass : fail });
	add(atLeast(d.piVersion, MIN_PI), "pi version", d.piVersion, `${d.piVersion} is older than ${MIN_PI.join(".")}; run pi update, then restart pi-supervisor`);
	add(atLeast(d.nodeVersion, MIN_NODE), "node version", d.nodeVersion, `${d.nodeVersion} is older than ${MIN_NODE.join(".")}; install Node ${MIN_NODE.join(".")} or later`);

	const model = (name: string, ref: string) => {
		const { provider, id } = parseModelRef(ref);
		const m = d.find(provider, id);
		if (!m) return out.push({ level: "FAIL", name, detail: `${name}: ${ref} has no model of that name; remap it with /supervisor-config` });
		const ok = d.hasAuth(m);
		out.push({ level: ok ? "PASS" : "FAIL", name, detail: ok ? ref : `${name}: ${ref} has no credentials; /login, set the provider key, or remap it with /supervisor-config` });
	};
	try {
		const config = loadConfig(d.agentDir);
		if (!config) out.push({ level: "FAIL", name: "config", detail: `${join(d.agentDir, CONFIG_FILE)} not found; run /supervisor-config` });
		else {
			out.push({ level: "PASS", name: "config", detail: join(d.agentDir, CONFIG_FILE) });
			for (const t of TIERS) model(`tier ${t}`, config.tiers[t]);
			if (config.critic) model("critic", config.critic);
			else out.push({ level: "PASS", name: "critic", detail: "none; the critic agent uses its tier" });
		}
	} catch (e) {
		out.push({ level: "FAIL", name: "config", detail: `${(e as Error).message}; run /supervisor-config` });
	}

	try {
		const agents = loadAgents(join(d.root, "agents"), d.parse);
		add(agents.some((a) => a.name === "supervisor"), "agents", `${agents.length} agents`, "no agent named supervisor");
	} catch (e) {
		out.push({ level: "FAIL", name: "agents", detail: (e as Error).message });
	}

	const web = ["web_search", "fetch_content"].every((t) => d.tools.includes(t));
	add(web, "web tools", "web_search and fetch_content", webPending(d.agentDir) ? "installed; active after /reload" : "run /supervisor-config", "WARN");
	for (const cmd of Object.keys(NEEDS)) add(d.onPath(cmd), cmd, "found", `not on PATH; ${NEEDS[cmd]}`, "WARN");
	return out;
}

export function formatChecks(c: Check[]): string {
	const n = (l: Check["level"]) => c.filter((x) => x.level === l).length;
	return [...c.map((x) => `${x.level.padEnd(4)}  ${x.name}  ${x.detail}`), `${n("FAIL")} FAIL, ${n("WARN")} WARN`].join("\n");
}
