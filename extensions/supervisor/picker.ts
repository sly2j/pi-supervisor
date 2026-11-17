// A list picker with type-to-filter. Outside the TUI (RPC tests, print mode) it is plain ui.select.
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const MAX_ROWS = 12;

// Case-insensitive; every whitespace-separated word of the query must occur in the label.
export function filterLabels(labels: string[], query: string): string[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	return labels.filter((l) => words.every((w) => l.toLowerCase().includes(w)));
}

// The query after one keypress: printable text is appended, backspace removes the last character.
export function editQuery(query: string, data: string): string {
	if (data === "\x7f" || data === "\b") return query.slice(0, -1);
	return data.length > 0 && !/[\x00-\x1f\x7f]/.test(data) && !data.startsWith("\x1b") ? query + data : query;
}

// Resolves to the chosen label, or undefined on Escape.
export async function pickLabel(ctx: ExtensionCommandContext, title: string, labels: string[]): Promise<string | undefined> {
	if (ctx.mode !== "tui") return ctx.ui.select(title, labels);
	return ctx.ui.custom<string | undefined>((_tui, theme, kb, done) => {
		let query = "";
		let sel = 0;
		const shown = () => filterLabels(labels, query);
		return {
			render(width: number): string[] {
				const items = shown();
				sel = Math.min(sel, Math.max(0, items.length - 1));
				const start = Math.max(0, Math.min(sel - Math.floor(MAX_ROWS / 2), items.length - MAX_ROWS));
				const cut = (s: string) => (s.length > width - 2 ? s.slice(0, Math.max(0, width - 3)) + "…" : s);
				const rows = items.slice(start, start + MAX_ROWS).map((l, i) =>
					start + i === sel ? theme.fg("accent", `→ ${cut(l)}`) : `  ${cut(l)}`);
				return [
					...title.split("\n").map((t) => theme.fg("accent", cut(t))),
					`Filter: ${query}▏`,
					...(rows.length ? rows : [theme.fg("warning", "  No matching models")]),
					theme.fg("dim", `${items.length}/${labels.length}  type to filter, ↑↓ move, enter select, esc cancel`),
				];
			},
			handleInput(data: string): void {
				const items = shown();
				if (kb.matches(data, "tui.select.up")) sel = sel === 0 ? Math.max(0, items.length - 1) : sel - 1;
				else if (kb.matches(data, "tui.select.down")) sel = sel >= items.length - 1 ? 0 : sel + 1;
				else if (kb.matches(data, "tui.select.confirm")) { if (items[sel]) done(items[sel]); }
				else if (kb.matches(data, "tui.select.cancel")) done(undefined);
				else { query = editQuery(query, data); sel = 0; }
				_tui.requestRender();
			},
			invalidate() {},
		};
	});
}
