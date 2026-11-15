// Test fixture: a token-free provider "scripted" whose replies follow the task text.
// The task is JSON after "Task: ": {say}, {echoSystem}, {echoUser}, {echoTools}, {error}, {sleep}, {dispatch, then}.
// Appends BEFORE-AGENT-START-MARKER through before_agent_start, as the persona will (D10).
// Writes "<pid>\t<agent>\t<agentDir>" to $PI_SUP_TEST_LOG at load when set.
import { appendFileSync } from "node:fs";
import { fauxAssistantMessage, fauxProvider, fauxToolCall, getCurrentSystemPrompt, getCurrentTools } from "@earendil-works/pi-ai";
import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";

const text = (c: unknown): string =>
	typeof c === "string" ? c : (c as { type: string; text?: string }[]).map((b) => b.text ?? "").join("\n");

export default function (pi: ExtensionAPI) {
	const log = process.env.PI_SUP_TEST_LOG;
	if (log) appendFileSync(log, `${process.pid}\t${process.env.PI_SUPERVISOR_AGENT ?? "main"}\t${getAgentDir()}\n`);
	const faux = fauxProvider({
		provider: "scripted",
		api: "scripted",
		models: ["top", "strong", "standard", "fast"].map((id) => ({ id })),
	});
	const reply = async (context: { messages: { role: string; content: unknown }[] }, options?: { signal?: AbortSignal }) => {
		const msgs = context.messages;
		const last = msgs[msgs.length - 1];
		const user = [...msgs].reverse().find((m) => m.role === "user");
		const raw = user ? text(user.content) : "";
		let s: Record<string, any> = {};
		try {
			s = JSON.parse(raw.slice(raw.indexOf("{")));
		} catch {
			return fauxAssistantMessage("ok");
		}
		if (last.role === "toolResult") return fauxAssistantMessage(`${s.then ?? "got"}: ${text(last.content)}`);
		if (s.sleep) {
			await new Promise<void>((r) => {
				const t = setTimeout(r, s.sleep);
				options?.signal?.addEventListener("abort", () => (clearTimeout(t), r()), { once: true });
			});
			if (options?.signal?.aborted) return fauxAssistantMessage("", { stopReason: "aborted", errorMessage: "aborted" });
		}
		if (s.error) return fauxAssistantMessage("", { stopReason: "error", errorMessage: s.error });
		if (s.echoSystem) return fauxAssistantMessage(getCurrentSystemPrompt(msgs as never));
		if (s.echoUser) return fauxAssistantMessage(raw);
		if (s.echoTools) return fauxAssistantMessage(getCurrentTools(msgs as never).map((t) => t.name).join(","));
		if (s.dispatch) return fauxAssistantMessage([fauxToolCall("dispatch", s.dispatch)], { stopReason: "toolUse" });
		return fauxAssistantMessage(s.say ?? "ok");
	};
	faux.setResponses(Array.from({ length: 64 }, () => reply as never));
	pi.registerProvider(faux.provider);
	pi.on("before_agent_start", (e) => {
		e.systemPromptOptions.appendSystemPrompt += "\nBEFORE-AGENT-START-MARKER";
	});
}
