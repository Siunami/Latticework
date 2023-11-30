import { Plugin, MarkdownView, Editor } from "obsidian";
import {
	processURI,
	parseEditorPosition,
	encodeURIComponentString,
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
			const from = view.editor.getCursor("from");
			const to = view.editor.getCursor("to");

			// problem, I'm not dealing with "\n" correctly. Then note slicing the right parts
			// slow down, walk through this part, line by line. Understand it deeply.
			let rollingIndex = 0;
			const lines = text.split("\n").map((line: string, i: number) => {
				let data = { line, index: rollingIndex, length: line.length + 1, i };
				rollingIndex += data.length;
				return data;
			});

			let startIndex = lines.filter((line: any) => line.i == from.line)[0];
			startIndex = startIndex.index + from.ch;
			let endIndex = lines.filter((line: any) => line.i == to.line)[0];
			endIndex = endIndex.index + to.ch;

			let prefix = text
				.slice(startIndex - 25 > 0 ? startIndex - 25 : 0, startIndex)
				.split("\n")
				.slice(-1)[0];
			let suffix = text.slice(endIndex, endIndex + 25).split("\n")[0];

			let reference = `[↗](urn:${encodeURIComponentString(
				prefix
			)}-:${encodeURIComponentString(selection)}:-${encodeURIComponentString(
				suffix
			)}:${encodeURIComponentString(view.file.path)}:${encodeURIComponentString(
				view.editor.getCursor("from").line +
					"," +
					view.editor.getCursor("from").ch
			)}:${encodeURIComponentString(
				view.editor.getCursor("to").line + "," + view.editor.getCursor("to").ch
			)})`;

			if (!only) {
				reference = '"' + selection + '" ' + reference;
			}

			// Write the selected text to the clipboard
			await navigator.clipboard.writeText(reference);
		}
	}
}
