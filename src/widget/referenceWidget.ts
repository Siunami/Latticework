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

function processLine(line: Element) {
	let lineCopy = line?.cloneNode(true) as HTMLElement;
	console.log(lineCopy.innerText);
	lineCopy?.querySelectorAll(".reference-span").forEach((span) => {
		span.innerHTML = "↗";
	});

	return lineCopy;
}

export function getReferencePosition(
	view: EditorView,
	currLine: HTMLSpanElement,
	reference: string,
	content: string
) {
	let lines = view.contentDOM.querySelectorAll(".cm-line");

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
	// make copy of activeLine element
	let activeLineCopy = processLine(activeLine);
	// non-reference parts of the text
	let parts = activeLineCopy.innerText.split("↗");

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
		console.log(startText[i], startText.charCodeAt(i));
		if (startText.charCodeAt(i) === 8203) {
			whiteSpaceCount++;
		}
	}

	// get all the prior lines to active line and the length of the text
	let prevLineCharCount = Array.from(lines)
		.slice(0, activeLineIndex)
		.reduce((acc, line) => {
			let processedLine = processLine(line); // contents of a line is just a single arrow character
			let parts = processedLine.innerText.split("↗");

			let lineReferences = line?.querySelectorAll(".reference-data-span");
			let lineReferencesData = Array.from(lineReferences || []).map(
				(span) => "[↗](urn:" + span.getAttribute("data") + ")"
			);
			let allSerializedText = [...parts, ...lineReferencesData].join("") + "\n";

			for (let i = 0; i < allSerializedText.length; i++) {
				console.log(allSerializedText[i], allSerializedText.charCodeAt(i));
				if (allSerializedText.charCodeAt(i) === 8203) {
					console.log("got an 8203");
					console.log(processedLine.innerText);
					acc--;
				}
			}
			// let allSerializedText = [...parts, ...lineReferencesData].join("");
			return allSerializedText.length + acc;
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
	toggleValue: string | null = null
) {
	content = typeof content == "string" ? content : content[1];

	const [prefix, text, suffix, file, from, to, portal, toggle] =
		content.split(":");
	// Serialize the toggle state for reference into file
	// KNOWN ERROR. contentDOM only returns partial file for efficiency on large documents. So will lose serialization in this case.
	// referenceSpan.classList.toggle("reference-span-hidden");

	let newToggle = toggleValue ? toggleValue : toggle === "f" ? "t" : "f";
	let reference = `[↗](urn:${prefix}:${text}:${suffix}:${file}:${from}:${to}:${portal}:${newToggle})`;

	let currLine = referenceSpan?.parentElement?.parentElement;

	const results = getReferencePosition(
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

			let reference = content[0];
			let dataString = content[1];
			const [prefix, text, suffix, file, from, to, portal, toggle = "f"] =
				dataString.split(":");

			let decodedFile = decodeURIComponentString(file);
			// const leaves = getThat().workspace.getLeavesOfType("markdown");
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

			backlinks[backlinkIndex].remove();
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
