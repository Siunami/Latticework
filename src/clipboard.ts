import { MarkdownView, View } from "obsidian";
import {
	encodeURIComponentString,
	getPrefixAndSuffix,
	processURI,
} from "./utils";
import { REFERENCE_REGEX } from "./constants";

export function createClipboardText(
	view: any,
	selection: string,
	toggle: boolean = true
) {
	const text = view.data;
	const from = view.editor.posToOffset(view.editor.getCursor("from"));
	const to = view.editor.posToOffset(view.editor.getCursor("to"));
	const { prefix, suffix } = getPrefixAndSuffix(text, from, to);

	let reference = `[↗](urn:${encodeURIComponentString(
		prefix
	)}-:${encodeURIComponentString(selection)}:-${encodeURIComponentString(
		suffix
	)}:${encodeURIComponentString(view.file.path)}:${from}:${to}:${"portal"}:${
		toggle ? "t" : "f"
	})`;
	return reference;
}

// [↗](urn:Also-: hopefully fix the multi-line reference:-%0A- URNs:11-23 Todo.md)
// [↗](urn:PREFIX-:TEXT:-SUFFIX:FILE:STARTINDEX:ENDINDEX)
export async function updateClipboard(toggle: boolean = false) {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);
	// Make sure the user is editing a Markdown file.
	if (view) {
		let selection: string = view.editor.getSelection();
		let reference = createClipboardText(view, selection, toggle);

		if (view.file) {
			// Write the selected text to the clipboard
			await navigator.clipboard.writeText(reference);
		}
	}
}
