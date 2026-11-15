// Stand-in for pi's parseFrontmatter (D16): scalars, [a, b] lists and "- item" lists.
export function parse(content: string): { frontmatter: Record<string, unknown>; body: string } {
	const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!m) return { frontmatter: {}, body: content };
	const fm: Record<string, unknown> = {};
	let key = "";
	for (const line of m[1].split("\n")) {
		const item = line.match(/^\s+-\s+(.*)$/);
		if (item) {
			(fm[key] as string[]).push(item[1].trim());
			continue;
		}
		const kv = line.match(/^([\w-]+):\s*(.*)$/);
		if (!kv) continue;
		key = kv[1];
		const v = kv[2].trim();
		fm[key] = v === "" ? [] : v.startsWith("[") ? v.slice(1, -1).split(",").map((s) => s.trim()) : v.replace(/^"(.*)"$/, "$1");
	}
	return { frontmatter: fm, body: m[2] };
}
