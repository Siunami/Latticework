import { Plugin, MarkdownView, Editor } from "obsidian";
import {
	processURI,
	parseEditorPosition,
	encodeURIComponentString,
	getPrefixAndSuffix,
} from "./utils";

// [↗](urn:Also-: hopefully fix the multi-line reference:-%0A- URNs:11-23 Todo.md)
// [↗](urn:PREFIX-:TEXT:-SUFFIX:FILE:STARTINDEX:ENDINDEX)
export async function updateClipboard(only: boolean = false) {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);
	// Make sure the user is editing a Markdown file.
	if (view) {
		let selection = view.editor.getSelection();
		if (view.file) {
			const text = view.data;
			const from = view.editor.posToOffset(view.editor.getCursor("from"));
			const to = view.editor.posToOffset(view.editor.getCursor("to"));
			const { prefix, suffix } = getPrefixAndSuffix(text, from, to);
			let reference = `[↗](urn:${encodeURIComponentString(
				prefix
			)}-:${encodeURIComponentString(selection)}:-${encodeURIComponentString(
				suffix
			)}:${encodeURIComponentString(
				view.file.path
			)}:${from}:${to}:${encodeURIComponentString(
				only ? "portal" : "no-portal"
			)})`;

			// if (!only) {
			// 	reference = '"' + selection + '" ' + reference;
			// }

			// Write the selected text to the clipboard
			await navigator.clipboard.writeText(reference);
		}
	}
}
