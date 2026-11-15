// Test stand-in for pi-web-access: one tool named web_search.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web search",
		description: "Test stand-in for web search",
		parameters: Type.Object({}),
		async execute() {
			return { content: [{ type: "text", text: "none" }], details: {} };
		},
	});
}
