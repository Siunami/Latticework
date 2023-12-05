import { Editor, TFile, WorkspaceLeaf, MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { v5 as uuidv5 } from "uuid";

import {
	state,
	updateHover,
	getThat,
	getReferences,
	updateReference,
} from "./state";
import { processURI, getPrefixAndSuffix } from "./utils";
import { REFERENCE_REGEX } from "./constants";
import { collectLeavesByTabHelper } from "./workspace";

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

	// span.addEventListener("mouseenter", async () => {
	// 	svg.style.backgroundColor = SVG_HOVER_COLOR;
	// });

	// span.addEventListener("mouseleave", async () => {
	// 	svg.style.backgroundColor = "white";
	// });

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

function getReferenceMarkID(backlink: Backlink): string {
	const jsonString = JSON.stringify(backlink);
	const id = uuidv5(jsonString, "fb813ebb-1b53-4306-aa9c-655627447f0b");
	return `backlink-${id}`;
}

function getReferenceMarkContainer(editor: Editor): HTMLElement {
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
	const container = getReferenceMarkContainer(editor);
	const elements: HTMLElement[] = [];
	for (let i = 0; i < container.children.length; i++) {
		elements.push(container.children.item(i) as HTMLElement);
	}
	return elements;
}

export function updateReferenceMarkPosition(
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
	const referenceContainer = getReferenceMarkContainer(editor);
	backlinksToLeaf.forEach((backlink) => {
		const { from } = backlink.referencedLocation;
		/* 
		When the range in the reference text doesn't match,
		This means that the text has updated
		Find the new range position if possible
		Otherwise (future) remove the reference mark
		
		// console.log("test");
		// if (rangeText != text) {
		// 	const positions = findTextPositions(leaf.view, text);
		// 	console.log(positions);
		// 	if (positions?.rangeStart && positions?.rangeEnd) {
		// 		rangeStart = positions.rangeStart;
		// 		rangeEnd = positions.rangeEnd;
		// 	}
		// 	//  else {
		// 	// 	console.log("reference not found");
		// 	// 	let exists = filteredReferences
		// 	// 		.map((x: any) => x.reference)
		// 	// 		.indexOf(reference);
		// 	// 	if (exists != -1) {
		// 	// 		filteredReferences[exists].element.remove();
		// 	// 		removeReferenceMark(reference);
		// 	// 	}
		// 	// }
		// }
		*/
		const bbox = getCodeMirrorEditorView(editor).coordsAtPos(from);
		let referenceMarker = referenceContainer.querySelector(
			`#${getReferenceMarkID(backlink)}`
		) as HTMLElement | null;

		if (referenceMarker === null) {
			referenceMarker = createReferenceMark(backlink, leaf, editor);
		}

		if (bbox) {
			referenceMarker.style.top = bbox.top - titleBbox.top + 32 + "px";
			referenceMarker.style.left = lineBbox.width + 40 + "px";
		}
	});
}

export function updateReferenceMarkPositions(allBacklinks: Backlink[]) {
	const { workspace } = getThat().app;
	const leaves = workspace.getLeavesOfType("markdown") as WorkspaceLeaf[];
	const visibleLeaves = leaves.filter((leaf) =>
		// @ts-ignore TODO: find a better way to access this -- sketchy!
		leaf.tabHeaderEl.className.includes("is-active")
	);

	visibleLeaves.forEach((visibleLeaf) => {
		const backlinksToLeaf = allBacklinks.filter(
			(b) => b.referencedLocation.filename == getFilename(visibleLeaf)
		);
		updateReferenceMarkPosition(visibleLeaf, backlinksToLeaf);
	});
}

export function createReferenceMark(
	backlink: Backlink,
	leaf: WorkspaceLeaf,
	editor: Editor
): HTMLElement {
	// @ts-ignore TODO: find a better way to access this...
	const containerEl: Element = leaf.containerEl;
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
	span.id = getReferenceMarkID(backlink);

	span.addEventListener("click", async () => {
		const { workspace } = state.values[0].app;
		const leavesByTab = collectLeavesByTabHelper();

		const { tabIdx, index, dataString, leafId } = state.values[2];
		/* If temporary, then keep leaf */
		if (dataString) {
			let [prefix, text, suffix, file, from, to] = processURI(dataString);
			/*
					The problem here is that I don't have the position of the span element.
					I want to set the active cursor to the end of the span
			// let [text2, file2, from2, to2] = this.name.split("|");
			// const currentTab = getHoveredTab(leavesByTab, span);
			// // console.log("currentTab");
			// // console.log(currentTab);
			// let rangeEnd2 = parseEditorPosition(to2);

			// const lineText = currentTab?.view?.editor.getLine(rangeEnd2.line);
			// // console.log(lineText);
			// // currentTab.view.editor.setCursor(rangeEnd2);
			*/

			let targetLeaf = leavesByTab[tabIdx][1][index];
			workspace.setActiveLeaf(targetLeaf);
			const editor = targetLeaf.view.editor;
			editor.setCursor(editor.cm.posToOffset(to));

			updateHover({
				leafId: null,
				originalTop: null,
			});
		}
	});

	getReferenceMarkContainer(editor).appendChild(span);
	return span;
}

export function addReferencesToLeaf(leaf: WorkspaceLeaf) {
	const allBacklinks: Backlink[] = getReferences();
	const filename = getFilename(leaf);
	// const leafReferences = allBacklinks.filter(
	// 	(x) => x.referencedLocation.filename == filename
	// );
	const markdownView = getMarkdownView(leaf);
	let workspaceTabs = markdownView.containerEl.closest(".workspace-tabs");
	if (!workspaceTabs) {
		throw new Error("Missing workspace tabs");
	}

	console.log(allBacklinks);
	console.log(leaf);
	console.log(getFilename(leaf));
	const backlinksToLeaf = allBacklinks.filter(
		(b) => b.referencingLocation.filename == getFilename(leaf)
	);

	getContainerElement(markdownView.editor)
		.querySelector(".cm-scroller")!
		.addEventListener("scroll", () => {
			updateReferenceMarkPositions(backlinksToLeaf);
		});

	updateReferenceMarkPositions(backlinksToLeaf);
	let resizeObserver = new ResizeObserver(() => {
		updateReferenceMarkPositions(backlinksToLeaf);
	});

	resizeObserver.observe(workspaceTabs);
}

export interface DocumentLocation {
	prefix: string;
	text: string;
	suffix: string;
	filename: string;
	from: number; // document offsets
	to: number; // document offsets
}

export interface Backlink {
	referencedLocation: DocumentLocation;
	referencingLocation: DocumentLocation;
	dataString: string;
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

function createReferenceData(
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
export function generateReferences() {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		console.log("generating references");
		let backlinks: Backlink[] = [];
		let markdownFiles = this.app.vault.getMarkdownFiles();
		// console.log(markdownFiles);
		Promise.all(
			markdownFiles.map((file: TFile) => this.app.vault.read(file))
		).then((files) => {
			const zippedArray = markdownFiles.map((file: TFile, index: number) => ({
				markdownFile: file,
				fileData: files[index],
			}));

			zippedArray.forEach((file: { markdownFile: TFile; fileData: string }) => {
				backlinks.push(
					...createReferenceData(file.fileData, file.markdownFile)
				);
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

			updateReference({ references: backlinks });
			const leaves = this.app.workspace.getLeavesOfType("markdown");

			leaves.forEach((leaf: WorkspaceLeaf) => {
				addReferencesToLeaf(leaf);
			});
		});
	}, 100);
}

export async function recomputeReferencesForPage() {
	const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeLeaf) return;
	const file = activeLeaf.leaf.view.file;
	const fileData = await this.app.vault.read(file);

	// console.log(fileData);
	// updateReference({ references: createReferenceData(fileData, file) });
	// console.log(getReferences());
}

export async function openReference() {
	const { workspace } = state.values[0].app;
	const leavesByTab = collectLeavesByTabHelper();

	const { tabIdx, index, dataString, leafId } = state.values[2];
	/* If temporary, then keep leaf */
	if (dataString) {
		let [prefix, text, suffix, file, from, to] = processURI(dataString);
		// let rangeEnd = parseEditorPosition(to);
		/*
					The problem here is that I don't have the position of the span element.
					I want to set the active cursor to the end of the span
				*/

		// let [text2, file2, from2, to2] = this.name.split("|");
		// const currentTab = getHoveredTab(leavesByTab, span);
		// // console.log("currentTab");
		// // console.log(currentTab);
		// let rangeEnd2 = parseEditorPosition(to2);

		// const lineText = currentTab?.view?.editor.getLine(rangeEnd2.line);
		// // console.log(lineText);
		// // currentTab.view.editor.setCursor(rangeEnd2);

		let targetLeaf = leavesByTab[tabIdx][1][index];
		workspace.setActiveLeaf(targetLeaf);
		const editor = targetLeaf.view.editor;
		editor.setCursor(editor.cm.offsetToPos(to));
		updateHover({
			leafId: null,
			originalTop: null,
		});
	}
}
