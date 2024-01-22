import {
	EditorView,
	WidgetType,
	Decoration,
	DecorationSet,
	ViewPlugin,
	ViewUpdate,
	MatchDecorator,
	gutter,
	GutterMarker,
} from "@codemirror/view";

import {
	openReference,
	createReferenceIcon,
	updateBacklinkMarkPositions,
} from "../references";
import { decodeURIComponentString, encodeURIComponentString } from "src/utils";
import { getThat, updateCursor } from "src/state";
import { Editor, MarkdownView } from "obsidian";
import { removeHighlight } from "src/mark";
import { collectLeavesByTabHelper } from "src/workspace";
import { getEditorView } from "src/effects";

function processLine(line: Element) {
	let lineCopy = line?.cloneNode(true) as HTMLElement;
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
	// let currLine = referenceSpan?.parentElement?.parentElement;

	// get the index of the activeLine
	let activeLineIndex;
	let seenActive = false;
	console.log(currLine);
	console.log("^currline");

	lines.forEach((line, i) => {
		console.log(line);
		if (seenActive) return;
		if (line == currLine) {
			seenActive = true;
			activeLineIndex = i;
		}
	});

	console.log(currLine);

	// const editor: Editor | undefined =
	// 	getThat().workspace.getActiveViewOfType(MarkdownView)?.editor;
	// if (!editor) return;
	// const cursor = editor.getCursor();
	// console.log(cursor);
	// console.log(activeLineIndex);

	if (activeLineIndex === undefined) return;
	let activeLine = lines[activeLineIndex];
	// make copy of activeLine element
	let activeLineCopy = processLine(activeLine);
	// non-referenced parts of the text
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

	// const index = lineReferencesData.reduce(
	// 	(prevI1ndex, currentValue, currentIndex) => {
	// 		if (currentValue.includes(content[0])) {
	// 			return currentIndex;
	// 		}
	// 		return prevIndex;
	// 	},
	// 	null
	// );

	if (!index && index != 0) throw new Error("Reference not found");

	// get the text before the reference
	let startText = [
		...parts.slice(0, index + 1),
		...lineReferencesData.slice(0, index),
	];

	// get all the prior lines to active line and the length of the text
	let prevLineCharCount = Array.from(lines)
		.slice(0, activeLineIndex)
		.reduce((acc, line) => {
			let processedLine = processLine(line);
			let parts = processedLine.innerText.split("↗");

			let lineReferences = line?.querySelectorAll(".reference-data-span");
			let lineReferencesData = Array.from(lineReferences || []).map(
				(span) => "[↗](urn:" + span.getAttribute("data") + ")"
			);
			let allSerializedText = [...parts, ...lineReferencesData].join("") + "\n";
			return allSerializedText.length + acc;
		}, 0);

	// set range to replace with new reference serialization
	let from = prevLineCharCount + startText.join("").length;
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

	// let newToggle = referenceSpan.classList.contains("reference-span-hidden")
	// 	? "f"
	// 	: "t";
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
		const { from: transactionFrom, to: transactionTo } = results;
		const transaction = view.state.update({
			changes: { from: transactionFrom, to: transactionTo, insert: reference },
		});
		view.dispatch(transaction);
		await updateBacklinkMarkPositions();
	}

	return;

	// // referenceSpan.classList.toggle("reference-span-hidden", newToggle === "f");
	// console.log("newToggle: " + newToggle);

	// let lines = view.contentDOM.querySelectorAll(".cm-line");
	// let currLine = referenceSpan?.parentElement?.parentElement;

	// // get the index of the activeLine
	// let activeLineIndex;
	// let seenActive = false;
	// lines.forEach((line, i) => {
	// 	if (seenActive) return;
	// 	if (line == currLine) {
	// 		seenActive = true;
	// 		activeLineIndex = i;
	// 	}
	// });

	// // const editor: Editor | undefined =
	// // 	getThat().workspace.getActiveViewOfType(MarkdownView)?.editor;
	// // if (!editor) return;
	// // const cursor = editor.getCursor();
	// // console.log(cursor);
	// // console.log(activeLineIndex);

	// if (activeLineIndex === undefined) return;
	// let activeLine = lines[activeLineIndex];
	// // make copy of activeLine element
	// let activeLineCopy = processLine(activeLine);
	// // non-referenced parts of the text
	// let parts = activeLineCopy.innerText.split("↗");

	// // get all references
	// let lineReferences = activeLine?.querySelectorAll(".reference-data-span");

	// // get the full serialized version for these references
	// let lineReferencesData = Array.from(lineReferences || []).map(
	// 	(span) => "[↗](urn:" + span.getAttribute("data") + ")"
	// );

	// if (content) {
	// 	let index: number | null = null;
	// 	lineReferencesData.forEach((reference, i) => {
	// 		if (!index) {
	// 			if (reference.includes(content)) {
	// 				index = i;
	// 			}
	// 		}
	// 	});

	// 	// const index = lineReferencesData.reduce(
	// 	// 	(prevIndex, currentValue, currentIndex) => {
	// 	// 		if (currentValue.includes(content[0])) {
	// 	// 			return currentIndex;
	// 	// 		}
	// 	// 		return prevIndex;
	// 	// 	},
	// 	// 	null
	// 	// );

	// 	if (!index && index != 0) throw new Error("Reference not found");

	// 	// get the text before the reference
	// 	let startText = [
	// 		...parts.slice(0, index + 1),
	// 		...lineReferencesData.slice(0, index),
	// 	];

	// 	// get all the prior lines to active line and the length of the text
	// 	let prevLineCharCount = Array.from(lines)
	// 		.slice(0, activeLineIndex)
	// 		.reduce((acc, line) => {
	// 			let processedLine = processLine(line);
	// 			let parts = processedLine.innerText.split("↗");

	// 			let lineReferences = line?.querySelectorAll(".reference-data-span");
	// 			let lineReferencesData = Array.from(lineReferences || []).map(
	// 				(span) => "[↗](urn:" + span.getAttribute("data") + ")"
	// 			);
	// 			let allSerializedText =
	// 				[...parts, ...lineReferencesData].join("") + "\n";
	// 			return allSerializedText.length + acc;
	// 		}, 0);

	// 	// set range to replace with new reference serialization
	// 	let from = prevLineCharCount + startText.join("").length;
	// 	let to = from + reference.length;

	// 	const transaction = view.state.update({
	// 		changes: { from, to, insert: reference },
	// 	});
	// 	console.log(transaction);
	// 	view.dispatch(transaction);
	// 	await updateBacklinkMarkPositions();

	// 	// await this.updateName(reference, from, to);
	// }
}

/* new placeholder */
class ReferenceWidget extends WidgetType {
	constructor(
		private name: string,
		private view: EditorView,
		private pos: number,
		private referenceSpan: Element | null = null,
		private parentElement: HTMLElement | null | undefined = null
	) {
		super();
	}

	eq(other: ReferenceWidget) {
		return this.name === other.name;
	}

	async updateName(name: string, from: number, to: number) {
		// const transaction = this.view.state.update({
		// 	changes: { from, to, insert: name },
		// });
		// this.view.dispatch(transaction);
		// await updateBacklinkMarkPositions();
		this.name = name;
	}

	getView() {
		return this.view;
	}

	destroy() {
		setTimeout(() => {
			console.log("remove highlight");
			console.log(this.name);
			console.log(this.pos);
			console.log(this.view);
			console.log(this.referenceSpan);
			console.log(this.parentElement);
			const regex = /\[↗\]\(urn:([^)]*)\)/g;
			let content = regex.exec(this.name);
			if (!content) throw new Error("Invalid reference");

			const [prefix, text, suffix, file, from, to, portal, toggle = "f"] =
				content[1].split(":");

			let decodedFile = decodeURIComponentString(file);
			// const leaves = getThat().workspace.getLeavesOfType("markdown");
			let leavesByTab = collectLeavesByTabHelper();
			let leaf = leavesByTab.flat().filter((leaf) => {
				return leaf.getViewState().state.file == decodedFile;
			})[0];
			let view = getEditorView(leaf);

			// const results = getReferencePosition(
			// 	view,
			// 	this.parentElement as HTMLSpanElement,
			// 	this.name,
			// 	text
			// );
			// if (!results) return;
			console.log(view);
			removeHighlight(view, parseInt(from), parseInt(to));
			updateCursor({
				delete: true,
			});
		}, 10);
	}

	toDOM() {
		const regex = /\[↗\]\(urn:([^)]*)\)/g;
		let content = regex.exec(this.name);
		if (!content) throw new Error("Invalid reference");

		const [prefix, text, suffix, file, from, to, portal, toggle = "f"] =
			content[1].split(":");

		// highlightDefaultSelection(this.view, parseFloat(from), parseFloat(to));

		const { span, svg } = createReferenceIcon(
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
				await serializeReference(content, referenceSpan, this.view);
				// referenceSpan.
				referenceSpan.classList.toggle("reference-span-hidden");
				if (content) this.name = content[0];
				if (referenceSpan) {
					this.referenceSpan = referenceSpan;
					this.parentElement = referenceSpan?.parentElement?.parentElement;
				}

				// // Serialize the toggle state for reference into file
				// // KNOWN ERROR. contentDOM only returns partial file for efficiency on large documents. So will lose serialization in this case.
				// referenceSpan.classList.toggle("reference-span-hidden");

				// let newToggle = referenceSpan.classList.contains(
				// 	"reference-span-hidden"
				// )
				// 	? "f"
				// 	: "t";
				// let reference = `[↗](urn:${prefix}:${text}:${suffix}:${file}:${from}:${to}:${portal}:${newToggle})`;

				// let lines = this.getView().contentDOM.querySelectorAll(".cm-line");

				// // get the index of the activeLine
				// let activeLineIndex;
				// let seenActive = false;
				// lines.forEach((line, i) => {
				// 	if (seenActive) return;
				// 	if (line.classList.contains("cm-active")) {
				// 		seenActive = true;
				// 		activeLineIndex = i;
				// 	}
				// });

				// // const editor: Editor | undefined =
				// // 	getThat().workspace.getActiveViewOfType(MarkdownView)?.editor;
				// // if (!editor) return;
				// // const cursor = editor.getCursor();
				// // console.log(cursor);
				// // console.log(activeLineIndex);

				// if (activeLineIndex === undefined) return;
				// let activeLine = lines[activeLineIndex];
				// // make copy of activeLine element
				// let activeLineCopy = processLine(activeLine);
				// // non-referenced parts of the text
				// let parts = activeLineCopy.innerText.split("↗");

				// // get all references
				// let lineReferences = activeLine?.querySelectorAll(
				// 	".reference-data-span"
				// );

				// // get the full serialized version for these references
				// let lineReferencesData = Array.from(lineReferences || []).map(
				// 	(span) => "[↗](urn:" + span.getAttribute("data") + ")"
				// );
				// if (content && content[1]) {
				// 	// identify which reference is being toggled
				// 	let index = lineReferencesData.indexOf(content[0]);
				// 	if (index == -1) throw new Error("Reference not found");

				// 	// get the text before the reference
				// 	let startText = [
				// 		...parts.slice(0, index + 1),
				// 		...lineReferencesData.slice(0, index),
				// 	];

				// 	// get all the prior lines to active line and the length of the text
				// 	let prevLineCharCount = Array.from(lines)
				// 		.slice(0, activeLineIndex)
				// 		.reduce((acc, line) => {
				// 			let processedLine = processLine(line);
				// 			let parts = processedLine.innerText.split("↗");

				// 			let lineReferences = line?.querySelectorAll(
				// 				".reference-data-span"
				// 			);
				// 			let lineReferencesData = Array.from(lineReferences || []).map(
				// 				(span) => "[↗](urn:" + span.getAttribute("data") + ")"
				// 			);
				// 			let allSerializedText =
				// 				[...parts, ...lineReferencesData].join("") + "\n";
				// 			return allSerializedText.length + acc;
				// 		}, 0);

				// 	// set range to replace with new reference serialization
				// 	let from = prevLineCharCount + startText.join("").length;
				// 	let to = from + reference.length;

				// 	await this.updateName(reference, from, to);
				// }
			} else {
				openReference(ev);
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
