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
	getContainerElement,
} from "../references";
import { decodeURIComponentString, processURI } from "src/utils";
import { removeHighlight } from "src/mark";
import { collectLeavesByTabHelper } from "src/workspace";
import { getEditorView, startReferenceEffect } from "src/effects";
import { Backlink } from "src/types";
import {
	getBacklinks,
	getThat,
	removeBacklinks,
	updateBacklinks,
	updateOneBacklink,
} from "src/state";
import {
	MarkdownView,
	TFile,
	WorkspaceLeaf,
	MarkdownRenderer,
	Component,
} from "obsidian";
import {
	ACTION_TYPE,
	REFERENCE_REGEX,
	ZERO_WIDTH_SPACE_CODE,
} from "src/constants";

/**
 * Get the text on the active line
 * @param activeLine - the line that the reference is on
 */
function getActiveLineText(activeLine: HTMLElement): string {
	// prepare the active line for serialization
	let activeLineClone = activeLine.cloneNode(true) as HTMLElement;
	activeLineClone
		.querySelectorAll(".reference-span")
		.forEach((el) => (el.innerHTML = "↗"));

	// get all references on the line
	let activeLineData: string[] = Array.from(
		activeLineClone.querySelectorAll(".reference-data-span")
	).map((el) => {
		return "[↗](urn:" + el.getAttribute("data") + ")";
	});

	let activeLineText = activeLineClone.innerText;
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
	return activeLineText;
}

/**
 * Get the index position of the reference in the document
 * @param activeLine - the line that the reference is on
 * @param reference - the reference to be serialized
 */
export async function getReferencePosition(
	activeLine: HTMLSpanElement,
	reference: string
): Promise<{ from: number | undefined; to: number | undefined }> {
	// get and process raw text
	let markdownFile: TFile | null = getThat().workspace.getActiveFile();
	if (!(markdownFile instanceof TFile))
		return { from: undefined, to: undefined };
	let fileData = await getThat().vault.read(markdownFile);

	const newLines = fileData.split("\n"); // Source of truth

	const activeLineText = getActiveLineText(activeLine);

	// get the line number of the active line
	let activeLineIndex = newLines.indexOf(activeLineText);

	// this is undefined if the file hasn't finished saving changes
	if (activeLineIndex == -1) return { from: undefined, to: undefined };

	let prevLineCharCount = newLines
		.slice(0, activeLineIndex)
		.reduce((acc, line) => {
			return line.length + acc + 1;
		}, 0);

	let startText = newLines[activeLineIndex].split(reference)[0];

	// set range to replace with new reference serialization
	let from = prevLineCharCount + startText.length;
	let to = from + reference.length;
	return { from, to };
}

/**
 * Create new reference, find old reference position, and replace
 *
 * @param content
 * @param referenceSpan
 * @param view
 * @param hideReference
 * @returns
 */
export async function serializeReference(
	content: any,
	referenceSpan: HTMLElement,
	view: EditorView,
	hideReference: string | null = null
): Promise<boolean> {
	content = typeof content == "string" ? content : content[1];

	const [prefix, text, suffix, file, from, to, portal, toggle] =
		content.split(":");

	let oldReference = `[↗](urn:${content})`;

	let currLine = referenceSpan?.parentElement?.parentElement;
	if (!currLine) {
		return false;
	}

	let reference = oldReference;
	let startReference = `${prefix}:${text}:${suffix}:${file}:${from}:${to}:${portal}`;
	let referenceText;

	// Im using the CSS property as the source of truth
	if (referenceSpan.classList.contains("reference-span-hidden")) {
		reference = `[↗](urn:${startReference}:t)`;
		referenceText = startReference + ":t";
	} else {
		reference = `[↗](urn:${startReference}:f)`;
		referenceText = startReference + ":f";
	}

	if (hideReference) {
		reference = `[↗](urn:${startReference}:${hideReference})`;
		referenceText = startReference + ":" + hideReference;
	}

	const results = await getReferencePosition(
		currLine as HTMLElement,
		oldReference
	);

	if (!results.from && !results.to) {
		console.log("reference location not found, not serializing this change");
		return false;
	}
	if (results.from && results.to) {
		const transaction = view.state.update({
			changes: { from: results.from, to: results.to, insert: reference },
		});

		view.dispatch(transaction);

		// // generate all backlinks again? Or just update the one that changed?
		await generateBacklinks();
		await updateBacklinkMarkPositions();
	}

	return true;
}

export function destroyReferenceWidget(name: string) {
	setTimeout(() => {
		const regex = /\[↗\]\(urn:([^)]*)\)/g;
		let content = regex.exec(name);
		if (!content) throw new Error("Invalid reference");

		let dataString = content[1];
		const [prefix, text, suffix, file, from, to, portal, toggle = "f"] =
			processURI(dataString);

		let leavesByTab = collectLeavesByTabHelper();
		let leaf = leavesByTab
			.filter((tab: WorkspaceLeaf[]) => {
				return !tab
					.map((leaf) =>
						getContainerElement(leaf).classList.contains("mod-active")
					)
					.reduce((acc, curr) => acc || curr, false);
			})
			.flat()
			.filter((leaf) => {
				return leaf.getViewState().state.file == file;
			})[0];

		let view: EditorView | null = getEditorView(leaf);
		if (view) {
			const leafMarkdownView: MarkdownView = leaf.view as MarkdownView;
			const index =
				leafMarkdownView.data.indexOf(
					prefix.slice(0, -1) + text + suffix.slice(1, suffix.length)
				) + prefix.slice(0, -1).length;

			// could of been selected forward or backward
			removeHighlight(view, from, to);
			removeHighlight(view, index, index + (to - from));
		}

		const markdownView = getMarkdownView(leaf);
		if (!markdownView) return;
		const editor = markdownView.editor;
		const backlinkContainer = getBacklinkContainer(editor);
		const backlinks = Array.from(
			backlinkContainer.querySelectorAll(".backlink-data-span")
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

		removeBacklinks([JSON.parse(referenceData)]);
		backlinkReference.remove();
	}, 10);
}

function createReferenceSpan(content: string) {
	let [prefix, text, suffix, file, from, to, portal, toggle = "f"] =
		processURI(content);

	const span = createReferenceIcon(
		portal == "portal" ? "inline reference widget |*|" : null
	);

	span.setAttribute("data", content);

	const containerSpan = document.createElement("span");
	containerSpan.classList.add("reference-container-span");
	const referenceSpan = document.createElement("span");
	// add class
	referenceSpan.classList.add("reference-span");

	// check if selection contained REFERENCE_REGEX, replace with just the text property in REFERENCE_REGEX
	const matches = [...text.matchAll(REFERENCE_REGEX)];
	matches.forEach((match) => {
		let [prefix2, text2, suffix2, file2, from2, to2] = processURI(match[1]);
		text = text.replace(match[0], text2 + " ↗");
	});

	// // render content as markdown in a hidden div
	const div = document.createElement("div");
	MarkdownRenderer.render(this.app, text, div, file, new Component());

	if (Array.from(div.children).length > 1) {
		referenceSpan.innerText = text;
	} else {
		[...Array.from(div.children)].forEach((child) => {
			referenceSpan.innerHTML += child.innerHTML;
		});
	}

	// referenceSpan.innerHTML = div.children[0].innerHTML;
	// referenceSpan.innerText = text;

	referenceSpan.classList.toggle("reference-span-hidden", toggle === "f");

	containerSpan.appendChild(referenceSpan);
	containerSpan.appendChild(span);
	return { containerSpan, referenceSpan, referenceDataSpan: span };
}

/* new placeholder */
class ReferenceWidget extends WidgetType {
	constructor(
		private name: string,
		private view: EditorView,
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
		if (this.serialized) {
			// don't destroy
			this.serialized = false;
			return;
		}
		destroyReferenceWidget(this.name);
	}

	toDOM() {
		const regex = /\[↗\]\(urn:([^)]*)\)/g;
		let content = regex.exec(this.name);
		if (!content) throw new Error("Invalid reference");

		let { containerSpan, referenceSpan, referenceDataSpan } =
			createReferenceSpan(content[1]);
		const [prefix, text, suffix, file, from, to, portal, toggle = "f"] =
			processURI(content[1]);

		containerSpan.title = file;

		containerSpan.addEventListener("click", async (ev) => {
			if (ev.shiftKey) {
				const editor = getMarkdownView(getThat().workspace.getLeaf()).editor;
				editor.setSelection(editor.getCursor());
				this.serialized = true;
				const completed = await serializeReference(
					content,
					referenceSpan,
					this.view
				);
				referenceSpan.classList.toggle("reference-span-hidden");
				// deselect text
			} else {
				let reference = referenceDataSpan.getAttribute("data");
				if (!reference) return;
				let data = await startReferenceEffect(
					referenceDataSpan,
					ACTION_TYPE.MOUSE
				);
				// reference may not be open yet so you need to open it first on click.
				openReference();
			}
		});

		return containerSpan;
	}
}

const referenceDecoration = (match: RegExpExecArray, view: EditorView) => {
	let decoration = Decoration.replace({
		widget: new ReferenceWidget(match[0], view),
	});
	return decoration;
};

const referenceMatcher = new MatchDecorator({
	// regexp: /\[\u2197\]\(urn:[\s\S^\)]*\)/g,
	// regexp: /\[\u2197\]\(urn:([^:]*:){5,6}[^:]*\)/g,
	// regexp: /\[\u2197\]\(urn:([^:]*:){6}[^:)]*\)/g,
	regexp: /\[\u2197\]\(urn:([^:]*:){7}[^:)]*\)/g,
	decoration: (match, view, pos) => {
		return referenceDecoration(match, view);
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
