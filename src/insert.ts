// Where and how the cleaned words land in the note.

import type { Editor, EditorPosition } from "obsidian";

/** One space before the words unless the cursor is at the start of a line or after whitespace. */
export function withLeadingSpace(lineBeforeCursor: string, text: string): string {
	if (lineBeforeCursor.length === 0) return text;
	return /\s$/.test(lineBeforeCursor) ? text : " " + text;
}

/** Inserts at the cursor as one undo step and leaves the cursor after the words. */
export function insertAtCursor(editor: Editor, text: string): void {
	const at = editor.getCursor();
	const before = editor.getLine(at.line).slice(0, at.ch);
	const words = withLeadingSpace(before, text);
	editor.transaction({
		changes: [{ from: at, text: words }],
		selection: { from: after(at, words) },
	});
	editor.focus();
}

function after(at: EditorPosition, text: string): EditorPosition {
	const lines = text.split("\n");
	return lines.length === 1
		? { line: at.line, ch: at.ch + text.length }
		: { line: at.line + lines.length - 1, ch: lines[lines.length - 1].length };
}
