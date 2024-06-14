import {
	EditorPosition,
	MarkdownView,
	WorkspaceLeaf,
	TFile,
	TAbstractFile,
	Notice,
	TextAreaComponent,
} from "obsidian";
import { REFERENCE_REGEX } from "./constants";
import { match } from "assert";
import { Backlink } from "./types";
import { TextFragment, getEditorView } from "./effects";
import { createClipboardText } from "./clipboard";
import {
	collectLeavesByTabHelper,
	getCurrentTabIndex,
	getAdjacentTabs,
} from "./workspace";
import {
	getFilename,
	getContainerElement,
	updateBacklinkMarkPositions,
	generateBacklinks,
	getMarkdownView,
} from "./references";
import { getThat } from "./state";
import { defaultHighlightSelection } from "./mark";

export function parseEditorPosition(positionString: string) {
	let [line, ch] = positionString.split(",");
	return { line: parseInt(line), ch: parseInt(ch) };
}

export function encodeURIComponentString(str: string): string {
	return encodeURIComponent(str).replace(/[:()]/g, function (c) {
		return "%" + c.charCodeAt(0).toString(16);
	});
}

export function decodeURIComponentString(str: string): string {
	return decodeURIComponent(
		str.replace(/%3A/g, ":").replace(/%28/g, "(").replace(/%29/g, ")")
	);
}

export function processURI(
	dataString: string
): [
	prefix: string,
	text: string,
	suffix: string,
	file: string,
	from: number,
	to: number,
	portal: string,
	toggle: string
] {
	let [prefix, text, suffix, file, from, to, portal, toggle] =
		dataString.split(":");
	prefix = decodeURIComponentString(prefix);
	text = decodeURIComponentString(text);
	suffix = decodeURIComponentString(suffix);
	file = decodeURIComponentString(file);
	from = decodeURIComponentString(from);
	to = decodeURIComponentString(to);
	if (portal) portal = decodeURIComponentString(portal);
	toggle = decodeURIComponentString(toggle);

	return [
		prefix,
		text,
		suffix,
		file,
		parseInt(from),
		parseInt(to),
		portal,
		toggle,
	];
}

export function getPrefixAndSuffix(document: string, from: number, to: number) {
	let prefix = document
		.slice(from - 25, from)
		.split("\n")
		.slice(-1)[0];

	let suffix = document.slice(to, to + 25).split("\n")[0];
	return { prefix, suffix };
}

type LineData = {
	line: string;
	index: number;
	length: number;
	i: number;
};

export function findTextPositions(
	text: string,
	textFragment: TextFragment
	// referenceIndex: number
): {
	rangeStart: EditorPosition;
	rangeEnd: EditorPosition;
	lines: LineData[];
} | null {
	let rollingIndex = 0;
	``;

	const lines: LineData[] = text.split("\n").map((line: string, i: number) => {
		let data: LineData = {
			line,
			index: rollingIndex,
			length: line.length + 1,
			i,
		};
		rollingIndex += data.length;
		return data;
	});
	let matchIndex: number | null = null;

	const searchTerm = textFragment.text;
	const prefix = textFragment.prefix;
	const suffix = textFragment.suffix;

	// I'm matching true or false suffix since cache may have stored either
	// making this part of the code match indifferent
	if (text.includes(prefix + searchTerm + suffix)) {
		matchIndex = text.indexOf(prefix + searchTerm + suffix);
	} else if (text.includes(prefix + searchTerm.slice(0, -2) + "f)" + suffix)) {
		matchIndex = text.indexOf(prefix + searchTerm.slice(0, -2) + "f)" + suffix);
	} else if (text.includes(prefix + searchTerm.slice(0, -2) + "t)" + suffix)) {
		matchIndex = text.indexOf(prefix + searchTerm.slice(0, -2) + "t)" + suffix);
	}

	if (matchIndex != null) {
		let index: number = matchIndex as number; // casting as typescript is missing that null has been checked
		let startIndex: number =
			lines.findIndex((line: any) => line.index > index + prefix.length) - 1;
		let endIndex: number =
			lines.findIndex(
				(line: any) => line.index > index + prefix.length + searchTerm.length
			) - 1;

		if (startIndex == -2) startIndex = lines.length - 1;
		if (endIndex == -2) endIndex = lines.length - 1;

		return {
			rangeStart: {
				line: startIndex,
				ch: matchIndex + prefix.length - lines[startIndex].index,
			},
			rangeEnd: {
				line: endIndex,
				ch:
					matchIndex +
					prefix.length +
					searchTerm.length -
					lines[endIndex].index,
			},
			lines,
		};
	}

	return null;
}

export function listItemLength(line: string) {
	// Matches lines that start with a bullet (either -, *, or + followed by a space)
	const bulletRegex = /^(\s*[-*+]\s+)/;

	// Matches lines that start with a number followed by a dot and a space (like "1. ")
	const numberRegex = /^(\s*\d+\.\s+)/;

	let match = line.match(bulletRegex) || line.match(numberRegex);
	return match ? match[0].length : 0;
}

// This isn't used anymore
export function checkCursorPositionAtDatastring(evt: Event): {
	matched: boolean;
	span: HTMLSpanElement | undefined;
} {
	const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
	const cursorFrom = activeView?.editor.getCursor("from");
	const cursorTo = activeView?.editor.getCursor("to");

	let matched = false;
	let matchSpan: HTMLSpanElement | undefined = undefined;
	if (
		cursorFrom &&
		cursorTo &&
		cursorFrom.ch == cursorTo.ch &&
		cursorFrom.line == cursorTo.line
		// &&cursorFrom.ch - 1 >= -1
	) {
		const lineText = activeView?.editor.getLine(cursorFrom.line);

		// from possible regex matches in lineText
		if (lineText) {
			const matches = [...lineText.matchAll(REFERENCE_REGEX)];
			matches.forEach((match) => {
				if (match.index?.toString()) {
					const start: number = match.index;
					const end: number = start + match[0].length;
					if (end == cursorTo.ch && evt.target) {
						const dataString = match[1];
						// get the html element at the match location
						let checkContainer = evt.target instanceof Element;
						if (!checkContainer)
							throw new Error("Element not instance of Element");
						let container = evt.target as Element;

						// find html span element in target that has a data attribute equal to contents
						let span = container;
						if (!span.getAttribute("data"))
							span = container.querySelector(
								`span[data="${dataString}"]`
							) as HTMLSpanElement;

						if (span && span instanceof HTMLSpanElement) {
							// Do something with the span element
							matched = true;

							matchSpan = span;
						}
					}
				}
			});
		}
	}
	return { matched, span: matchSpan };
}

export function debounce(func: Function, delay: number) {
	let timeoutId: NodeJS.Timeout;

	return function (...args: any[]) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			func.apply(this, args);
		}, delay);
	};
}

export function interlaceStringArrays(
	firstArray: string[],
	secondArray: string[]
) {
	let interlaced = [];
	let maxLength = Math.max(firstArray.length, secondArray.length);

	for (let i = 0; i < maxLength; i++) {
		if (i < firstArray.length) {
			interlaced.push(firstArray[i]);
		}
		if (i < secondArray.length) {
			interlaced.push(secondArray[i]);
		}
	}

	// Join the interlaced array into a single string (optional)
	let interlacedText = interlaced.join("");
	return interlacedText;
}

export async function createReference() {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) return;
	const editor = view.editor;
	let selection: string = editor.getSelection();

	// get backlink leaf
	let leavesByTab: [WorkspaceLeaf[]] | [] = collectLeavesByTabHelper();

	let currTabIdx = getCurrentTabIndex(leavesByTab, view.containerEl);

	const { rightAdjacentTab, leftAdjacentTab } = getAdjacentTabs(
		leavesByTab,
		currTabIdx,
		""
	);

	let rightFiles = rightAdjacentTab
		.filter((leaf) => {
			// console.log(leaf);
			return leaf.view instanceof MarkdownView;
		})
		.map((leaf) => {
			return [
				getFilename(leaf),
				getContainerElement(leaf).style.display != "none",
			];
		});

	let leftFiles = leftAdjacentTab
		.filter((leaf) => {
			// console.log(leaf);
			return leaf.view instanceof MarkdownView;
		})
		.map((leaf) => {
			return [
				getFilename(leaf),
				getContainerElement(leaf).style.display != "none",
			];
		});

	let activeFile: string;
	if (rightFiles.length > 0) {
		activeFile = rightFiles.filter((file) => file[1] === true)[0][0] as string;
	} else if (leftFiles.length > 0) {
		activeFile = leftFiles.filter((file) => file[1] === true)[0][0] as string;
	} else {
		// @ts-ignore
		activeFile = view.file.path;
	}

	let allFiles = this.app.vault.getAllLoadedFiles();
	let filePath: TFile = allFiles.filter(
		(file: TAbstractFile) =>
			file.path === activeFile ||
			file.path.split("/")[file.path.split("/").length - 1] === activeFile
	)[0] as TFile;

	let reference = createClipboardText(view, selection);
	console.log("reference: ", reference);

	let fileData = await this.app.vault.read(filePath);
	let results = await this.app.vault.modify(
		filePath,
		fileData + "\n\n" + reference
	);

	await generateBacklinks();
	await updateBacklinkMarkPositions([this.app.workspace.getLeaf()]);
	editor.setSelection(editor.getCursor());

	return reference;
}

export function createHighlight() {
	const activeLeaf = getThat().workspace.getLeaf();
	const view = getMarkdownView(activeLeaf);
	const editor = view.editor;
	const editorView = getEditorView(activeLeaf);
	if (!editorView) return;

	let from = editor.getCursor("from");
	let to = editor.getCursor("to");

	let start =
		view.data.split("\n").slice(0, from.line).join("\n").length + from.ch + 1;
	let end =
		view.data.split("\n").slice(0, to.line).join("\n").length + to.ch + 1;
	defaultHighlightSelection(editorView, start, end);
	return editor;
}

// This is the same as the flow in the layoutBacklinks function, except it doesn't maintain last input state.
export function commentBox(element: HTMLSpanElement, leaf: WorkspaceLeaf) {
	let textArea = new TextAreaComponent(element);
	textArea.inputEl.innerHTML = element.innerText;
	if (element.innerText == "↗") {
		textArea.inputEl.innerHTML += " ";
	}
	textArea.inputEl.classList.add("backlink-comment");
	textArea.inputEl.focus();
	textArea.inputEl.setSelectionRange(
		textArea.inputEl.value.length,
		textArea.inputEl.value.length
	);

	textArea.inputEl.placeholder = "Add a comment...";

	// Function to adjust the height of the textarea
	function adjustTextareaHeight() {
		textArea.inputEl.style.height = "auto";
		// 30 px is a single line height
		textArea.inputEl.style.height = 30 + "px";
		textArea.inputEl.style.height = textArea.inputEl.scrollHeight + "px";
	}

	// Adjust the height initially and on input
	adjustTextareaHeight();
	textArea.inputEl.addEventListener("input", adjustTextareaHeight);

	textArea.inputEl.addEventListener("blur", (ev: MouseEvent) => {
		ev.preventDefault();
		textArea.inputEl.remove();
	});

	textArea.inputEl.addEventListener("keydown", async (ev: KeyboardEvent) => {
		// if backspace is hit and will delete an ↗, don't delete the textarea
		if (ev.key === "Backspace" || ev.key === "Delete") {
			let start = textArea.inputEl.selectionStart;
			let end = textArea.inputEl.selectionEnd;
			let text = textArea.inputEl.value;

			if (text.slice(start, end).includes("↗")) {
				new Notice("Can't delete a reference icon (↗).");
				ev.preventDefault();
			} else if (
				ev.key === "Backspace" &&
				start > 0 &&
				text[start - 1] === "↗"
			) {
				new Notice("Can't delete a reference icon (↗).");
				ev.preventDefault();
			}
		}

		// if enter is pressed without the shift key
		if (ev.key === "Enter") {
			ev.preventDefault();
			let text = textArea.inputEl.value;
			let filename = getFilename(leaf);
			let reference = element.getAttribute("reference");
			if (reference) {
				let referenceData = JSON.parse(reference);
				let from = referenceData.referencingLocation.from;
				let to = referenceData.referencingLocation.to;

				let activeFile = referenceData.referencingLocation.filename;
				let allFiles = this.app.vault.getAllLoadedFiles();
				let filePath: TFile = allFiles.filter(
					(file: TAbstractFile) =>
						file.path === activeFile ||
						file.path.split("/")[file.path.split("/").length - 1] === activeFile
				)[0] as TFile;
				let fileData = await this.app.vault.read(filePath);

				let prefix = fileData.slice(0, from);
				let suffix = fileData.slice(to);

				let leadingText = prefix.split("\n")[prefix.split("\n").length - 1];
				let followingText = suffix.split("\n")[0];

				let previousText = fileData.slice(
					from - leadingText.length,
					to + followingText.length
				);

				const matches = [...previousText.matchAll(REFERENCE_REGEX)].map(
					(x: any) => x[0]
				);
				const textParts = text.split("↗");

				const newText = interlaceStringArrays(textParts, matches);

				// Use slice to replace previousText with newText in the file data
				let updatedFileData =
					fileData.slice(0, from - leadingText.length) +
					newText +
					fileData.slice(to + followingText.length);
				let results = await this.app.vault.modify(filePath, updatedFileData);
				await generateBacklinks();
				await updateBacklinkMarkPositions([leaf]);
			}
			textArea.inputEl.blur();
		}
	});
}
