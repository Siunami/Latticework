import { MarkdownView } from "obsidian";
import {
	encodeURIComponentString,
	getPrefixAndSuffix,
	processURI,
} from "./utils";
import { REFERENCE_REGEX } from "./constants";

// [↗](urn:Also-: hopefully fix the multi-line reference:-%0A- URNs:11-23 Todo.md)
// [↗](urn:PREFIX-:TEXT:-SUFFIX:FILE:STARTINDEX:ENDINDEX)
export async function updateClipboard(toggle: boolean = false) {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);
	// Make sure the user is editing a Markdown file.
	if (view) {
		let selection: string = view.editor.getSelection();

		// console.log(selection);

		// // check if selection contained REFERENCE_REGEX, replace with just the text property in REFERENCE_REGEX
		// const matches = [...selection.matchAll(REFERENCE_REGEX)];
		// console.log(matches);
		// matches.forEach((match) => {
		// 	let [prefix, text, suffix, file, from, to] = processURI(match[1]);
		// 	selection = selection.replace(match[0], text);
		// });

		// console.log(selection);

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
			)}:${from}:${to}:${"portal"}:${toggle ? "t" : "f"})`;

			// Write the selected text to the clipboard
			await navigator.clipboard.writeText(reference);
		}
	}
}
