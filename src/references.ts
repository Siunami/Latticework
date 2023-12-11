import { Editor, TFile, WorkspaceLeaf, MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { v5 as uuidv5 } from "uuid";

import {
	state,
	updateHover,
	getThat,
	getBacklinks,
	updateBacklinks,
	updateCursor,
	getCursor,
	getHover,
	resetCursor,
} from "./state";
import {
	processURI,
	getPrefixAndSuffix,
	handleRemoveHoveredCursor,
	checkFocusCursor,
} from "./utils";
import { ACTION_TYPE, REFERENCE_REGEX } from "./constants";
import { collectLeavesByTabHelper } from "./workspace";
import { DocumentLocation, Backlink } from "./types";

export function createReferenceIcon(): {
	span: HTMLSpanElement;
	svg: SVGElement;
} {
	const span = document.createElement("span");

	const height = 28;

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("width", "24");
	svg.setAttribute("height", `${height}`);
	svg.setAttribute("viewBox", `0 0 24 ${height}`);
	svg.setAttribute("fill", "white");
	svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	svg.style.border = "4px solid black";
	svg.style.backgroundColor = "white";
	svg.style.cursor = "pointer";

	const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
	line.setAttribute("x1", "6");
	line.setAttribute("y1", `${(height - 8) / 3}`);
	line.setAttribute("x2", "18");
	line.setAttribute("y2", `${(height - 8) / 3}`);
	line.setAttribute("stroke-width", "2"); // Set the stroke weight to 1
	line.setAttribute("stroke", "black"); // Set the stroke color to black

	svg.appendChild(line);

	const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	line2.setAttribute("x1", "6");
	line2.setAttribute("y1", `${((height - 8) / 3) * 2}`);
	line2.setAttribute("x2", "20");
	line2.setAttribute("y2", `${((height - 8) / 3) * 2}`);
	line2.setAttribute("stroke-width", "2"); // Set the stroke weight to 1
	line2.setAttribute("stroke", "black"); // Set the stroke color to black

	svg.appendChild(line2);

	const line3 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	line3.setAttribute("x1", "6");
	line3.setAttribute("y1", `${((height - 8) / 3) * 3}`);
	line3.setAttribute("x2", "15");
	line3.setAttribute("y2", `${((height - 8) / 3) * 3}`);
	line3.setAttribute("stroke-width", "2"); // Set the stroke weight to 1
	line3.setAttribute("stroke", "black"); // Set the stroke color to black

	svg.appendChild(line3);

	span.appendChild(svg);
	return { span, svg };
}

function getCodeMirrorEditorView(editor: Editor): EditorView {
	// @ts-ignore this type is missing... but the Obsidian docs tell us to do it this way??
	return editor.cm as EditorView;
}

function getContainerElement(
	editorOrLeaf: Editor | WorkspaceLeaf
): HTMLElement {
	// @ts-ignore TODO: find a better way to access this... EXTREMELY SKETCHY
	return editorOrLeaf.containerEl;
}

function getBacklinkID(backlink: Backlink): string {
	const jsonString = JSON.stringify(backlink);
	const id = uuidv5(jsonString, "fb813ebb-1b53-4306-aa9c-655627447f0b");
	return `backlink-${id}`;
}

function getBacklinkContainer(editor: Editor): HTMLElement {
	const containerEl: HTMLElement = getContainerElement(editor);
	const referenceMarkContainerID = "referenceMarkContainer";
	const container = containerEl.querySelector(`#${referenceMarkContainerID}`);
	if (container) {
		return container as HTMLElement;
	} else {
		const newContainer = document.createElement("div");
		newContainer.id = referenceMarkContainerID;
		containerEl.querySelector(".cm-scroller")!.appendChild(newContainer);
		return newContainer;
	}
}

function getReferenceMarks(editor: Editor): HTMLElement[] {
	const container = getBacklinkContainer(editor);
	const elements: HTMLElement[] = [];
	for (let i = 0; i < container.children.length; i++) {
		elements.push(container.children.item(i) as HTMLElement);
	}
	return elements;
}

export function updateBacklinkMarkPosition(
	leaf: WorkspaceLeaf,
	backlinksToLeaf: Backlink[]
) {
	const title = getContainerElement(leaf).querySelector(".inline-title");
	if (!title) {
		throw new Error("Missing title");
	}
	const titleBbox = title.getBoundingClientRect();
	const line = getContainerElement(leaf).querySelector(".cm-line");
	if (!line) {
		throw new Error("Document has no lines");
	}
	const lineBbox = line.getBoundingClientRect();

	const editor = getMarkdownView(leaf).editor;
	const backlinkContainer = getBacklinkContainer(editor);

	let backlinks = [];
	for (let i = 0; i < backlinkContainer.children.length; i++) {
		backlinks.push(backlinkContainer.children.item(i) as HTMLElement);
	}
	let backlinkIds: string[] = backlinksToLeaf.map((x) => getBacklinkID(x));
	backlinks
		.map((x: HTMLSpanElement) => x.id)
		.forEach((id) => {
			if (!backlinkIds.includes(id)) {
				let element = document.getElementById(id);
				if (element) element.remove();
			}
		});

	backlinksToLeaf.forEach((backlink) => {
		const { from } = backlink.referencedLocation;

		const bbox = getCodeMirrorEditorView(editor).coordsAtPos(from);
		let referenceMarker = backlinkContainer.querySelector(
			`#${getBacklinkID(backlink)}`
		) as HTMLElement | null;

		if (referenceMarker === null) {
			referenceMarker = createBacklinkMark(backlink, leaf, editor);
		}

		if (bbox) {
			referenceMarker.style.top = bbox.top - titleBbox.top + 32 + "px";
			referenceMarker.style.left = lineBbox.width + 40 + "px";
		}
	});
}

export async function updateBacklinkMarkPositions() {
	await recomputeReferencesForPage();
	const { workspace } = getThat();
	const leaves = workspace.getLeavesOfType("markdown") as WorkspaceLeaf[];

	const allBacklinks: Backlink[] = getBacklinks();
	leaves.forEach((leaf) => {
		const backlinksToLeaf = allBacklinks.filter(
			// @ts-ignore
			(b) => b.referencedLocation.filename == leaf.view.file.path
		);
		updateBacklinkMarkPosition(leaf, backlinksToLeaf);
	});
}

export function createBacklinkMark(
	backlink: Backlink,
	leaf: WorkspaceLeaf,
	editor: Editor
): HTMLElement {
	// @ts-ignore TODO: find a better way to access this...
	const containerEl: Element = getContainerElement(leaf);
	const title = containerEl.querySelector(".inline-title");
	if (!title) {
		throw new Error("Missing title");
	}
	const titleBbox = title.getBoundingClientRect();
	const line = containerEl.querySelector(".cm-line");
	if (!line) {
		throw new Error("No lines??");
	}
	const lineBbox = line.getBoundingClientRect();

	const { from } = backlink.referencedLocation;
	const bbox = getCodeMirrorEditorView(editor).coordsAtPos(from);

	let { span } = createReferenceIcon();
	span.style.color = "black";
	span.style.position = "absolute";
	if (bbox) {
		span.style.top = bbox.top - titleBbox.top + 20 + "px";
		span.style.left = lineBbox.width + 40 + "px";
	}
	span.id = getBacklinkID(backlink);

	// span.addEventListener("click", async () => {
	// 	const { workspace } = state.values[0].app;
	// 	const leavesByTab = collectLeavesByTabHelper();

	// 	const { tabIdx, index, dataString, leafId } = state.values[2];
	// 	/* If temporary, then keep leaf */
	// 	if (dataString) {
	// 		let [prefix, text, suffix, file, from, to] = processURI(dataString);
	// 		/*
	// 				The problem here is that I don't have the position of the span element.
	// 				I want to set the active cursor to the end of the span
	// 		// let [text2, file2, from2, to2] = this.name.split("|");
	// 		// const currentTab = getHoveredTab(leavesByTab, span);
	// 		// // console.log("currentTab");
	// 		// // console.log(currentTab);
	// 		// let rangeEnd2 = parseEditorPosition(to2);

	// 		// const lineText = currentTab?.view?.editor.getLine(rangeEnd2.line);
	// 		// // console.log(lineText);
	// 		// // currentTab.view.editor.setCursor(rangeEnd2);
	// 		*/

	// 		let targetLeaf = leavesByTab[tabIdx][index];
	// 		workspace.setActiveLeaf(targetLeaf);
	// 		const editor = targetLeaf.view.editor;
	// 		editor.setCursor(editor.cm.posToOffset(to));

	// 		updateHover({
	// 			leafId: null,
	// 			originalTop: null,
	// 		});
	// 	}
	// });

	getBacklinkContainer(editor).appendChild(span);
	return span;
}

export function addReferencesToLeaf(leaf: WorkspaceLeaf) {
	const markdownView = getMarkdownView(leaf);
	let workspaceTabs = markdownView.containerEl.closest(".workspace-tabs");
	if (!workspaceTabs) {
		throw new Error("Missing workspace tabs");
	}

	updateBacklinkMarkPositions();

	getContainerElement(markdownView.editor)
		.querySelector(".cm-scroller")!
		.addEventListener("scroll", () => {
			updateBacklinkMarkPositions();
		});

	let resizeObserver = new ResizeObserver(() => {
		updateBacklinkMarkPositions();
	});

	resizeObserver.observe(workspaceTabs);
}

function getMarkdownView(leaf: WorkspaceLeaf): MarkdownView {
	if (!(leaf.view instanceof MarkdownView)) {
		throw new Error("Unexpected non-markdown view");
	}
	return leaf.view as MarkdownView;
}

function getFilename(leaf: WorkspaceLeaf): string {
	const { file } = getMarkdownView(leaf);
	if (!file) {
		throw new Error("Unexpected missing file");
	}
	return file.name;
}

function createBacklinkData(
	referencingFileData: string,
	referencingFile: TFile
): Backlink[] {
	let backlinks: Backlink[] = [];

	let matches = [...referencingFileData.matchAll(REFERENCE_REGEX)];
	matches.forEach((match) => {
		let [prefix, text, suffix, referencedFileName, from, to] = processURI(
			match[1]
		);
		const referencedLocation: DocumentLocation = {
			prefix,
			text,
			suffix,
			filename: referencedFileName,
			from,
			to,
		};

		const referencingSurroundingStrings = getPrefixAndSuffix(
			referencingFileData,
			match.index!,
			match.index! + match.length
		);
		const referencingLocation: DocumentLocation = {
			prefix: referencingSurroundingStrings.prefix,
			text,
			suffix: referencingSurroundingStrings.suffix,
			filename: referencingFile.path,
			from: match.index!, // TODO do weird string format
			to: match.index! + match.length, // TODO do weird string format
		};

		backlinks.push({
			referencedLocation,
			referencingLocation,
			dataString: match[1],
		});
	});
	return backlinks;
}

let debounceTimer: NodeJS.Timeout;
export function generateBacklinks() {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		console.log("generating references");
		let backlinks: Backlink[] = [];
		let markdownFiles = this.app.vault.getMarkdownFiles();

		Promise.all(
			markdownFiles.map((file: TFile) => this.app.vault.read(file))
		).then((files) => {
			const zippedArray = markdownFiles.map((file: TFile, index: number) => ({
				markdownFile: file,
				fileData: files[index],
			}));

			zippedArray.forEach((file: { markdownFile: TFile; fileData: string }) => {
				backlinks.push(...createBacklinkData(file.fileData, file.markdownFile));
				// let matches = [...file.fileData.matchAll(REFERENCE_REGEX)];

				// matches.forEach((match) => {
				// 	let [prefix, text, suffix, file2, from, to] = processURI(match[1]);
				// 	references.push({
				// 		prefix,
				// 		text,
				// 		suffix,
				// 		file: file2,
				// 		from,
				// 		to,
				// 		dataString: match[1],
				// 		sourceFile: file.markdownFile.path,
				// 	});
				// });
			});

			updateBacklinks(backlinks);

			const leaves = this.app.workspace.getLeavesOfType("markdown");

			leaves.forEach((leaf: WorkspaceLeaf) => {
				addReferencesToLeaf(leaf);
			});
		});
	}, 100);
}

export async function recomputeReferencesForPage() {
	setTimeout(async () => {
		const leaves = this.app.workspace.getLeavesOfType("markdown");
		leaves.forEach(async (leaf: WorkspaceLeaf) => {
			// const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
			// if (!activeLeaf) return;
			const view = getMarkdownView(leaf);
			const file = view.file;
			if (!file) throw new Error("Missing file");
			const fileData = await this.app.vault.read(file);
			const references: Backlink[] = createBacklinkData(fileData, file);

			updateBacklinks(references);
		});
	}, 300);
}

export async function openReference(ev: MouseEvent) {
	let cursor = getCursor();
	let hover = getHover();
	let leaf = getThat().workspace.getLeafById(hover.leafId);

	// @ts-ignore
	let container = leaf.containerEl;
	if (!container) throw new Error("Container not found");
	container.style.opacity = "1";

	if (
		cursor &&
		hover &&
		cursor.dataString &&
		hover.dataString &&
		cursor.dataString == hover.dataString
	) {
		updateCursor({
			temp: false,
			viewport: null,
		});
	}
	updateHover({
		temp: false,
		viewport: null,
	});

	handleRemoveHoveredCursor(ACTION_TYPE.CURSOR);

	resetCursor();
}
