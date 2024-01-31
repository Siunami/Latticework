import {
	EditorView,
	WidgetType,
	Decoration,
	DecorationSet,
	ViewPlugin,
	ViewUpdate,
	MatchDecorator,
} from "@codemirror/view";

import {
	openReference,
	createReferenceIcon,
	updateBacklinkMarkPositions,
	getMarkdownView,
	getBacklinkContainer,
} from "../references";
import { decodeURIComponentString } from "src/utils";
import { removeHighlight } from "src/mark";
import { collectLeavesByTabHelper } from "src/workspace";
import { getEditorView } from "src/effects";
import { Backlink } from "src/types";
import { getThat, removeBacklinks } from "src/state";
import { TFile } from "obsidian";
import { REFERENCE_REGEX } from "src/constants";

function processLine(line: Element) {
	let lineCopy = line?.cloneNode(true) as HTMLElement;
	console.log(lineCopy.innerText);
	lineCopy?.querySelectorAll(".reference-span").forEach((span) => {
		span.innerHTML = "↗";
	});

	return lineCopy;
}

function countMarkdownFormattingChars(text: string): number {
	// Regular expressions for different types of Markdown formatting
	const markdownRegexes = [
		/\*\*[^*]+\*\*/g, // Bold
		/__[^_]+__/g, // Bold
		/\*[^*]+\*/g, // Italic
		/_[^_]+_/g, // Italic
		/~~[^~]+~~/g, // Strikethrough
		/\[[^\]]+\]\([^)]+\)/g, // Link
		/!\[[^\]]+\]\([^)]+\)/g, // Image
		/^#{1,6} .+/gm, // Heading
		/^> .+/gm, // Blockquote
		/^- .+/gm, // Unordered list
		/^\d+\. .+/gm, // Ordered list
		/`[^`]+`/g, // Inline code
		/```[^`]+```/g, // Code block
		/\[\[[^\]]+\]\]/g, // Obsidian link
		/\^\[[^\]]+\]/g, // Footnote
		/==[^=]+==/g, // Highlight
		/<[^>]+>/g, // HTML tags
		/::[^:]+::/g, // Obsidian tag
		/\[[^\]]+\]\[\]/g, // Empty link reference
		/\[[^\]]+\]\[[^\]]+\]/g, // Full link reference
		/\[[^\]]+\]: .+/g, // Link reference definition
		/!\[[^\]]+\]\[\]/g, // Empty image reference
		/!\[[^\]]+\]\[[^\]]+\]/g, // Full image reference
		/!\[[^\]]+\]: .+/g, // Image reference definition
	];

	let count = 0;

	// Count the number of formatting characters for each type of formatting
	for (let regex of markdownRegexes) {
		let match;
		while ((match = regex.exec(text)) !== null) {
			// Add the length of the matched formatting to the count
			count +=
				match[0].length -
				match[0].replace(/[*_~[\]()`#>!\-.=^{}<>:]/g, "").length;
		}
	}

	return count;
}

// 8203 is a zero-width space character
const ZERO_WIDTH_SPACE_CODE = 8203;

export async function getReferencePosition(
	view: EditorView,
	currLine: HTMLSpanElement,
	reference: string,
	content: string
) {
	let lines = view.contentDOM.querySelectorAll(".cm-line");

	let markdownFile: TFile | null = getThat().workspace.getActiveFile();
	if (!(markdownFile instanceof TFile)) return;
	let fileData = await getThat().vault.read(markdownFile); // I'm pretty sure this is the slow line.

	const newLines = fileData.split("\n").map((line) => {
		return line.replace(new RegExp(REFERENCE_REGEX, "g"), "↗");
	});

	// get the index of the activeLine
	let activeLineIndex;
	let seenActive = false;

	lines.forEach((line, i) => {
		if (seenActive) return;
		if (line == currLine) {
			seenActive = true;
			activeLineIndex = i;
		}
	});

	if (activeLineIndex === undefined) return;

	let activeLine = lines[activeLineIndex];

	// // make copy of activeLine element
	// let activeLineCopy = processLine(activeLine);

	// non-reference parts of the text
	let parts = newLines[activeLineIndex].split("↗");

	// get all references
	let lineReferences = activeLine?.querySelectorAll(".reference-data-span");

	// get the full serialized version for these references
	let lineReferencesData = Array.from(lineReferences || []).map(
		(span) => "[↗](urn:" + span.getAttribute("data") + ")"
	);

	if (!content) throw new Error("Reference not found");
	let index: number | null = null;
	lineReferencesData.forEach((reference, i) => {
		if (!index) {
			if (reference.includes(content)) {
				index = i;
			}
		}
	});

	if (!index && index != 0) throw new Error("Reference not found");

	// get the text before the reference
	let startText = [
		...parts.slice(0, index + 1),
		...lineReferencesData.slice(0, index),
	].join("");

	let whiteSpaceCount = 0;

	for (let i = 0; i < startText.length; i++) {
		if (startText.charCodeAt(i) === ZERO_WIDTH_SPACE_CODE) {
			whiteSpaceCount++;
		}
	}

	// These lines are doing nothing, because the markdown formating has been replaced with a special text nested in styling divs
	// console.log(countMarkdownFormattingChars(parts.slice(0, index + 1).join("")));
	// whiteSpaceCount += countMarkdownFormattingChars(
	// 	parts.slice(0, index + 1).join("")
	// );

	// get all the prior lines to active line and the length of the text
	let prevLineCharCount = Array.from(lines)
		.slice(0, activeLineIndex)
		.reduce((acc, line, index) => {
			console.log("acc: " + acc);

			// let processedLine = processLine(line); // contents of a line is just a single arrow character
			// let parts = processedLine.innerText.split("↗");
			let parts = newLines[index].split("↗");

			let lineReferences = line?.querySelectorAll(".reference-data-span");
			let lineReferencesData = Array.from(lineReferences || []).map(
				(span) => "[↗](urn:" + span.getAttribute("data") + ")"
			);
			let allSerializedText = [...parts, ...lineReferencesData].join("") + "\n";

			for (let i = 0; i < allSerializedText.length; i++) {
				// console.log(allSerializedText[i], allSerializedText.charCodeAt(i));
				if (allSerializedText.charCodeAt(i) === ZERO_WIDTH_SPACE_CODE) {
					acc--;
				}
			}

			// let count = countMarkdownFormattingChars(parts.join(""));
			// acc -= countMarkdownFormattingChars(parts.join(""));

			// console.log("count: " + count);

			console.log("acc: " + acc);

			console.log("allSerializedText.length: " + allSerializedText.length);
			console.log(allSerializedText.length + acc);

			// let allSerializedText = [...parts, ...lineReferencesData].join("");
			return allSerializedText.length + acc;
			// return allSerializedText.length + count + acc;
		}, 0); //- 1; // substract one cause don't want a new line for the last line

	// set range to replace with new reference serialization
	let from = prevLineCharCount + startText.length - whiteSpaceCount;
	let to = from + reference.length;
	return { from, to };
}

export async function serializeReference(
	content: any,
	referenceSpan: HTMLElement,
	view: EditorView,
	hideReference: string | null = null
) {
	content = typeof content == "string" ? content : content[1];

	const [prefix, text, suffix, file, from, to, portal, toggle] =
		content.split(":");
	// Serialize the toggle state for reference into file
	// KNOWN ERROR. contentDOM only returns partial file for efficiency on large documents. So will lose serialization in this case.
	// referenceSpan.classList.toggle("reference-span-hidden");

	let newToggle = hideReference ? hideReference : toggle === "f" ? "t" : "f";
	let reference = `[↗](urn:${prefix}:${text}:${suffix}:${file}:${from}:${to}:${portal}:${newToggle})`;

	let currLine = referenceSpan?.parentElement?.parentElement;

	const results = await getReferencePosition(
		view,
		currLine as HTMLElement,
		reference,
		text
	);
	if (results) {
		const transaction = view.state.update({
			changes: { from: results.from, to: results.to, insert: reference },
		});
		view.dispatch(transaction);
		console.log("updatebacklinkpositions");
		await updateBacklinkMarkPositions();
	}

	return;
}

/* new placeholder */
class ReferenceWidget extends WidgetType {
	constructor(
		private name: string,
		private view: EditorView,
		private pos: number,
		private referenceSpan: Element | null = null,
		private parentElement: HTMLElement | null | undefined = null,
		private serialized: boolean = false
	) {
		super();
	}

	eq(other: ReferenceWidget) {
		return this.name === other.name;
	}

	getView() {
		return this.view;
	}

	// this runs when re-serialized as well
	destroy() {
		console.log(this.serialized);
		if (this.serialized) {
			this.serialized = false;
			return;
		}
		setTimeout(() => {
			const regex = /\[↗\]\(urn:([^)]*)\)/g;
			let content = regex.exec(this.name);
			if (!content) throw new Error("Invalid reference");

			let dataString = content[1];
			const [prefix, text, suffix, file, from, to, portal, toggle = "f"] =
				dataString.split(":");

			let decodedFile = decodeURIComponentString(file);
			let leavesByTab = collectLeavesByTabHelper();
			let leaf = leavesByTab.flat().filter((leaf) => {
				return leaf.getViewState().state.file == decodedFile;
			})[0];

			let view = getEditorView(leaf);
			removeHighlight(view, parseInt(from), parseInt(to));
			const editor = getMarkdownView(leaf).editor;
			const backlinkContainer = getBacklinkContainer(editor);
			const backlinks = Array.from(
				backlinkContainer.querySelectorAll(".reference-data-span")
			);
			const backlinkData = backlinks.map((backlink: HTMLElement) => {
				let reference = backlink.getAttribute("reference");
				if (!reference) return {};
				return JSON.parse(reference);
			});
			const backlinkIndex = backlinkData.findIndex((backlink: Backlink) => {
				return (
					backlink.dataString === dataString &&
					backlink.referencedLocation.filename ===
						decodeURIComponentString(file)
				);
			});

			const backlinkReference = backlinks[backlinkIndex];
			if (!backlinkReference) return;

			const referenceData = backlinkReference.getAttribute("reference");
			if (!referenceData) return;
			removeBacklinks([JSON.parse(referenceData)]);
			backlinkReference.remove();
		}, 10);
	}

	toDOM() {
		const regex = /\[↗\]\(urn:([^)]*)\)/g;
		let content = regex.exec(this.name);
		if (!content) throw new Error("Invalid reference");

		const [prefix, text, suffix, file, from, to, portal, toggle = "f"] =
			content[1].split(":");

		const span = createReferenceIcon(
			portal == "portal" ? "inline reference widget |*|" : null
		);

		if (content) span.setAttribute("data", content[1]);

		const containerSpan = document.createElement("span");
		containerSpan.classList.add("reference-container-span");
		const referenceSpan = document.createElement("span");
		// add class
		referenceSpan.classList.add("reference-span");

		referenceSpan.innerHTML = decodeURIComponentString(text);
		referenceSpan.classList.toggle("reference-span-hidden", toggle === "f");

		containerSpan.appendChild(referenceSpan);
		containerSpan.appendChild(span);

		this.referenceSpan = referenceSpan;
		setTimeout(() => {
			this.parentElement = containerSpan.parentElement;
		}, 20);

		containerSpan.addEventListener("click", async (ev) => {
			if (ev.metaKey || ev.ctrlKey) {
				openReference(ev);

				// // Serialize the toggle state for reference into file
				// // KNOWN ERROR. contentDOM only returns partial file for efficiency on large documents. So will lose serialization in this case.
				// referenceSpan.classList.toggle("reference-span-hidden");
			} else {
				this.serialized = true;
				await serializeReference(content, referenceSpan, this.view);
				// referenceSpan.
				referenceSpan.classList.toggle("reference-span-hidden");
				if (content) this.name = content[0];
				if (referenceSpan) {
					this.referenceSpan = referenceSpan;
					this.parentElement = referenceSpan?.parentElement?.parentElement;
				}
			}
		});

		return containerSpan;
	}
}

const referenceDecoration = (
	match: RegExpExecArray,
	view: EditorView,
	pos: number
) => {
	let decoration = Decoration.replace({
		widget: new ReferenceWidget(match[0], view, pos),
	});
	return decoration;
};

const referenceMatcher = new MatchDecorator({
	// regexp: /\[\u2197\]\(urn:[\s\S^\)]*\)/g,
	// regexp: /\[\u2197\]\(urn:([^:]*:){5,6}[^:]*\)/g,
	// regexp: /\[\u2197\]\(urn:([^:]*:){6}[^:)]*\)/g,
	regexp: /\[\u2197\]\(urn:([^:]*:){7}[^:)]*\)/g,
	decoration: (match, view, pos) => {
		return referenceDecoration(match, view, pos);
	},
});

export const referenceResources = ViewPlugin.fromClass(
	class {
		referenceResources: DecorationSet;
		constructor(view: EditorView) {
			this.referenceResources = referenceMatcher.createDeco(view);
		}
		update(update: ViewUpdate) {
			this.referenceResources = referenceMatcher.updateDeco(
				update,
				this.referenceResources
			);
		}
		destroy() {
			this.referenceResources = Decoration.none;
		}
	},
	{
		decorations: (instance) => instance.referenceResources,
		provide: (plugin) =>
			EditorView.atomicRanges.of((view) => {
				return view.plugin(plugin)?.referenceResources || Decoration.none;
			}),
	}
);
