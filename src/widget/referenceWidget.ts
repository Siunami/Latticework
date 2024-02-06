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
	generateBacklinks,
} from "../references";
import { decodeURIComponentString } from "src/utils";
import { highlightSelection, removeHighlight } from "src/mark";
import { collectLeavesByTabHelper } from "src/workspace";
import { getEditorView } from "src/effects";
import { Backlink } from "src/types";
import {
	getBacklinks,
	getThat,
	removeBacklinks,
	updateBacklinks,
} from "src/state";
import { TFile } from "obsidian";
import { ZERO_WIDTH_SPACE_CODE } from "src/constants";

export async function getReferencePosition(
	view: EditorView,
	activeLine: HTMLSpanElement,
	oldReference: string,
	reference: string,
	content: string
) {
	// get and process raw text
	let markdownFile: TFile | null = getThat().workspace.getActiveFile();
	if (!(markdownFile instanceof TFile))
		return { from: undefined, to: undefined };
	let fileData = await getThat().vault.read(markdownFile);

	const newLines = fileData.split("\n");

	// the bug has something to do with the fact that the activeLineIndex is not being calculated correctly
	let activeLineClone = activeLine.cloneNode(true) as HTMLElement;
	activeLineClone
		.querySelectorAll(".reference-span")
		.forEach((el) => (el.innerHTML = "↗"));
	let activeLineText = activeLineClone.innerText;
	let activeLineData = Array.from(
		activeLineClone.querySelectorAll(".reference-data-span")
	).map((el) => {
		return "[↗](urn:" + el.getAttribute("data") + ")";
	});

	let tempText = "";
	activeLineText.split("↗").forEach((part, index) => {
		tempText += part;
		if (index < activeLineData.length) {
			tempText += activeLineData[index];
		}
	});
	activeLineText = tempText;
	for (let i = 0; i < activeLineText.length; i++) {
		if (activeLineText.charCodeAt(i) === ZERO_WIDTH_SPACE_CODE) {
			activeLineText = activeLineText.slice(0, i) + activeLineText.slice(i + 1);
		}
	}

	// want to identify the activeLineIndex of the activeLine in newLines, fileData is the full data, can't reference contentDOM
	// must get the activeLineIndex based on newLines, not contentDOM
	// it should match the activeLine div in contentDOM
	let activeLineIndex = newLines.indexOf(activeLineText);

	if (activeLineIndex == -1) return { from: undefined, to: undefined };

	let prevLineCharCount = newLines
		.slice(0, activeLineIndex)
		.reduce((acc, line) => {
			// account for zero-width spaces
			// for (let i = 0; i < line.length; i++) {
			// 	if (line.charCodeAt(i) === ZERO_WIDTH_SPACE_CODE) {
			// 		acc--;
			// 	}
			// }
			return line.length + acc + 1;
		}, 0);

	let startText = newLines[activeLineIndex].split(oldReference)[0];

	// account for zero-width spaces
	let lineAcc = 0;
	for (let i = 0; i < startText.length; i++) {
		if (startText.charCodeAt(i) === ZERO_WIDTH_SPACE_CODE) {
			lineAcc++;
		}
	}

	// if (collapseIndicator) {
	// 	console.log("COLLAPSE INDICATOR CURRENT LINE");
	// 	lineAcc -= 4;
	// }

	// set range to replace with new reference serialization
	let from = prevLineCharCount + startText.length - lineAcc;
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

	let oldReference = `[↗](urn:${content})`;

	let currLine = referenceSpan?.parentElement?.parentElement;
	if (!currLine) return;

	console.log(referenceSpan);

	let reference = `[↗](urn:${content})`;
	console.log(reference);

	if (referenceSpan.classList.contains("reference-span-hidden")) {
		reference = `[↗](urn:${prefix}:${text}:${suffix}:${file}:${from}:${to}:${portal}:t)`;
	} else {
		reference = `[↗](urn:${prefix}:${text}:${suffix}:${file}:${from}:${to}:${portal}:f)`;
	}
	console.log(reference);

	if (hideReference) {
		reference = `[↗](urn:${prefix}:${text}:${suffix}:${file}:${from}:${to}:${portal}:${hideReference})`;
	}

	console.log(reference);

	// let element = currLine.querySelector(`[data='${content}']`);
	// if (!element) {
	// 	element = currLine.querySelector(
	// 		`[data='${prefix}:${text}:${suffix}:${file}:${from}:${to}:${portal}:${newToggle}']`
	// 	);
	// 	if (!element) {
	// 		console.log("element not found");
	// 		return;
	// 	}
	// }
	// console.log(element);
	// console.log(element?.parentElement);
	// let referenceSpan = element?.parentElement?.querySelector(".reference-span");

	const results = await getReferencePosition(
		view,
		currLine as HTMLElement,
		oldReference,
		reference,
		text
	);

	if (!results.from && !results.to) {
		console.log("reference location not found, not serializing this change");
		return;
	}
	if (results) {
		const transaction = view.state.update({
			changes: { from: results.from, to: results.to, insert: reference },
		});
		console.log(transaction);
		view.dispatch(transaction);
		console.log("updatebacklinkpositions");
		// updateBacklinks()
		// console.log(getBacklinks());
		let backlink = getBacklinks().filter(
			(backlink) => backlink.dataString == content
		)[0];
		// console.log(backlink);
		// if (backlink) {
		// 	console.log(referenceSpan);
		// 	// removeBacklinks([backlink]);
		// 	console.log(getBacklinks());
		// 	backlink.dataString = reference;
		// 	updateBacklinks([backlink]);
		// 	console.log(getBacklinks());
		// 	await generateBacklinks();

		// } else {
		// 	await generateBacklinks();
		// }
		await generateBacklinks();
		await updateBacklinkMarkPositions();
	}

	return;
}

export function destroyReferenceWidget(name: string) {
	setTimeout(() => {
		const regex = /\[↗\]\(urn:([^)]*)\)/g;
		let content = regex.exec(name);
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
				backlink.referencedLocation.filename === decodeURIComponentString(file)
			);
		});

		const backlinkReference = backlinks[backlinkIndex];
		if (!backlinkReference) return;

		const referenceData = backlinkReference.getAttribute("reference");
		if (!referenceData) return;

		console.log(referenceData);
		removeBacklinks([JSON.parse(referenceData)]);
		backlinkReference.remove();
	}, 10);
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
		console.log(this.serialized, "destroy");
		if (this.serialized) {
			this.serialized = false;
			return;
		}
		destroyReferenceWidget(this.name);
	}

	toDOM() {
		const regex = /\[↗\]\(urn:([^)]*)\)/g;
		let content = regex.exec(this.name);
		if (!content) throw new Error("Invalid reference");

		const [prefix, text, suffix, file, from, to, portal, toggle = "f"] =
			content[1].split(":");

		console.log(content);

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
			console.log(this.name);
			if (ev.metaKey || ev.ctrlKey) {
				openReference(ev);
			} else {
				this.serialized = true;
				await serializeReference(content, referenceSpan, this.view);
				// console.log(parseInt(from), parseInt(to));
				// try {
				// 	highlightSelection(this.view, parseInt(from), parseInt(to));
				// } catch (e) {
				// 	console.log(e);
				// }

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
