// Test fixture for the live routing check: blocks every tool call and records it to $PI_SUP_STOP_LOG.
// From the second tool-calling assistant turn on, the block also ends the run (`terminate`), so a
// case can make one tool attempt and one answer, as the source's two-turn check allows.
import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let turn = 0;
	pi.on("turn_start", () => void turn++);
	pi.on("tool_call", (e) => {
		const log = process.env.PI_SUP_STOP_LOG;
		if (log) appendFileSync(log, `${JSON.stringify({ toolName: e.toolName, input: e.input, turn })}\n`);
		return { block: true, reason: "routing check: tools are disabled", terminate: turn >= 2 };
	});
}
