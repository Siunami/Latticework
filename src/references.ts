import {
	App,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
	MarkdownView,
} from "obsidian";

import {
	state,
	updateHover,
	updateReference,
	updateReferenceMarks,
	getReferenceMarks,
	getThat,
	getReferences,
	removeReferenceMark,
} from "./state";
import {
	processURI,
	parseEditorPosition,
	encodeURIComponentString,
} from "./utils";
import { REFERENCE_REGEX } from "./constants";
import { collectLeavesByTabHelper } from "./leaves";
import { SearchCursor } from "@codemirror/search"; // Import the SearchCursor class
import { Text } from "@codemirror/state";

function findTextPositions(
	view: MarkdownView,
	searchTerm: string,
	prefix: string = "",
	suffix: string = ""
) {
	if (searchTerm == "sidebar next to with a comme") {
		console.log("THIS IS THE ONE");
	}

	const editor = view.editor;

	// const test = new SearchCursor(Text.of(activeLeaf.view.data), searchTerm);
	// given text and search term, find all matches

	let rollingIndex = 0;
	const text = view.data;
	const lines = text.split("\n").map((line: string, i: number) => {
		let data = { line, index: rollingIndex, length: line.length + 1, i };
		rollingIndex += data.length;
		return data;
	});

	if (text.includes(prefix + searchTerm + suffix)) {
		let matchIndex = text.indexOf(prefix + searchTerm + suffix);
		console.log("matchIndex");
		console.log(matchIndex);
		let startIndex =
			lines.findIndex((line: any) => line.index > matchIndex + prefix.length) -
			1;

		let endIndex =
			lines.findIndex(
				(line: any) =>
					line.index > matchIndex + prefix.length + searchTerm.length
			) - 1;
		if (startIndex == -2) {
			startIndex = lines.length - 1;
			endIndex = lines.length - 1;
		}

		const selection = editor.getRange(
			{
				line: startIndex,
				ch: matchIndex + prefix.length - lines[startIndex].index,
			},
			{
				line: endIndex,
				ch:
					matchIndex +
					prefix.length +
					searchTerm.length -
					lines[endIndex].index,
			}
		);

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
	return {
		rangeStart: null,
		rangeEnd: null,
		lines,
	};
}

function findNewRange(
	leaf: any,
	text: string
): { from: number; to: number } | null {
	// const cursor = editor.getSearchCursor(text);
	// const cursor = new SearchCursor(Text.of(leaf.view.data), "a");
	console.log(leaf.view.data);
	console.log(text);
	// console.log(leaf.view.editor.cm.getSearchCursor(text));
	// console.log(leaf.view.editor.cm);
	const cursor = new SearchCursor(Text.of(leaf.view.data), text);

	console.log(cursor);
	if (cursor.next()) {
		return cursor.value;
	} else {
		return null;
	}
}

export function createReferenceIcon(): HTMLSpanElement {
	const span = document.createElement("span");

	span.addEventListener("mouseenter", async () => {
		span.style.backgroundColor = "rgb(187, 215, 230)";
		// this.startReferenceEffect(span, "cursor");
	});

	span.addEventListener("mouseleave", async () => {
		span.style.backgroundColor = "rgba(0, 0, 0, 0)";
		// this.endCursorEffect();
	});

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("width", "16");
	svg.setAttribute("height", "16");
	svg.setAttribute("viewBox", "0 0 16 16");
	svg.setAttribute("fill", "none");
	svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", "M8 16L0 8L8 0L16 8L8 16Z");
	path.setAttribute("fill", "yellow");

	svg.appendChild(path);
	span.appendChild(svg);
	return span;
}

export function updateReferenceMarkPosition(
	leaf: any,
	editor: any,
	leafReferences: any
) {
	const title = leaf.containerEl.querySelector(".inline-title");
	const titleBbox = title.getBoundingClientRect();
	const line = leaf.containerEl.querySelector(".cm-line");
	const lineBbox = line.getBoundingClientRect();

	let references = getReferenceMarks();
	let filteredReferences = references.filter((x: any) => x.id == leaf.id);

	leafReferences.forEach((reference: any) => {
		const { from, to, text } = reference;

		let rangeStart = parseEditorPosition(from);
		let rangeEnd = parseEditorPosition(to);
		let rangeText = editor.getRange(rangeStart, rangeEnd);

		const pos = editor.posToOffset(rangeStart);

		console.log(rangeText);
		console.log(pos);

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

		const bbox = editor.cm.coordsAtPos(pos);

		let exists = filteredReferences
			.map((x: any) => x.reference)
			.indexOf(reference);
		console.log(exists);
		if (exists != -1 && bbox) {
			filteredReferences[exists].element.style.top =
				bbox.top - titleBbox.top + 20 + "px";
			filteredReferences[exists].element.style.left =
				lineBbox.width + 40 + "px";
		}
	});
}

export function updateAllVisibleReferenceMarkPositions(
	references: any = getReferences()
) {
	const { workspace } = getThat().app;
	const leaves = workspace.getLeavesOfType("markdown");
	const visibleLeaves = leaves.filter((leaf: any) =>
		leaf.tabHeaderEl.className.includes("is-active")
	);

	console.log("updateAllVisibleReferenceMarkPositions");
	console.log(visibleLeaves);
	visibleLeaves.forEach((visibleLeaf: any) => {
		const title =
			visibleLeaf.containerEl.querySelector(".view-header-title").innerHTML +
			".md";
		const visibleLeafReferences = references.filter(
			(x: any) => x.file == title
		);
		updateReferenceMarkPosition(
			visibleLeaf,
			visibleLeaf.view.editor,
			visibleLeafReferences
		);
	});
}

export function createReferenceMark(
	reference: any,
	leaf: any = this.app.workspace.getLeaf(),
	editor: any = this.app.workspace.getLeaf().view.editor
) {
	const title = leaf.containerEl.querySelector(".inline-title");
	const titleBbox = title.getBoundingClientRect();
	const line = leaf.containerEl.querySelector(".cm-line");
	const lineBbox = line.getBoundingClientRect();

	console.log(reference);
	const { from, to } = reference;
	const rangeStart = parseEditorPosition(from);
	const rangeEnd = parseEditorPosition(to);

	const pos = editor.posToOffset(rangeStart);
	const bbox = editor.cm.coordsAtPos(pos);

	if (bbox) {
		let span = createReferenceIcon();
		updateReferenceMarks(span, reference, leaf.id);
		span.style.color = "black";
		span.style.position = "absolute";
		span.style.top = bbox.top - titleBbox.top + 20 + "px";
		span.style.left = lineBbox.width + 40 + "px";
		span.setAttribute("reference", JSON.stringify(reference));

		// span.addEventListener("mouseenter", async () => {
		// 	span.style.backgroundColor = "rgb(187, 215, 230)";
		// 	// this.startReferenceEffect(span, "cursor");
		// });

		// span.addEventListener("mouseleave", async () => {
		// 	span.style.backgroundColor = "rgba(0, 0, 0, 0)";
		// 	// this.endCursorEffect();
		// });

		span.addEventListener("click", async () => {
			console.log("click");
			console.log(reference.text);
			const { workspace } = state.values[0].app;
			const leavesByTab = collectLeavesByTabHelper();

			const { tabIdx, index, dataString, leafId } = state.values[2];
			/* If temporary, then keep leaf */
			if (dataString) {
				let [prefix, text, suffix, file, from, to] = processURI(dataString);
				let rangeEnd = parseEditorPosition(to);
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
				editor.setCursor(rangeEnd);

				updateHover({
					leafId: null,
					originalTop: null,
				});
			}
		});

		editor.containerEl.querySelector(".cm-scroller").appendChild(span);
	}
}

export function createReferenceMarkPositions(
	leaf: any,
	editor: any,
	leafReferences: any
) {
	let referenceMarks = getReferenceMarks().filter((x: any) => x.id == leaf.id);

	leafReferences.forEach((reference: any) => {
		if (
			referenceMarks
				.map((x: any) => JSON.stringify(x.reference))
				.indexOf(JSON.stringify(reference)) != -1
		) {
			return;
		}

		createReferenceMark(reference, leaf, editor);
	});

	// console.log(leafReferences);
	// referenceMarks.forEach((referenceMark: any) => {
	// 	console.log("referenceMark");
	// 	console.log(referenceMark);
	// 	let exists = leafReferences
	// 		.map((x: any) => JSON.stringify(x.reference))
	// 		.indexOf(JSON.stringify(referenceMark.reference));
	// 	console.log(exists);
	// 	if (exists == -1) {
	// 		removeReferenceMark(referenceMark.reference);
	// 		referenceMark.element.remove();
	// 	}
	// });
}

export function addReferencesToLeaf(leaf: any) {
	const references = getReferences();
	const title =
		leaf.containerEl.querySelector(".view-header-title").innerHTML + ".md";
	const leafReferences = references.filter((x: any) => x.file == title);
	let workspaceTabs = leaf.containerEl.closest(".workspace-tabs");

	// console.log(leaf.view.editor.containerEl.querySelector(".cm-scroller"));

	leaf.view.editor.containerEl
		.querySelector(".cm-scroller")
		.addEventListener("scroll", () => {
			console.log("scroll");
			createReferenceMarkPositions(leaf, leaf.view.editor, leafReferences);
			updateAllVisibleReferenceMarkPositions(references);
		});

	createReferenceMarkPositions(leaf, leaf.view.editor, leafReferences);
	updateAllVisibleReferenceMarkPositions(references);
	let resizeObserver = new ResizeObserver(() => {
		updateAllVisibleReferenceMarkPositions(references);
	});

	resizeObserver.observe(workspaceTabs);
}

let debounceTimer: NodeJS.Timeout;
export function generateReferences() {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		console.log("GENERATE REFERENCES");
		let references: any = [];
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
				let matches = [...file.fileData.matchAll(REFERENCE_REGEX)];
				matches.forEach((match) => {
					let [prefix, text, suffix, file2, from, to] = processURI(match[1]);
					references.push({
						prefix,
						text,
						suffix,
						file: file2,
						from,
						to,
						dataString: match[1],
						sourceFile: file.markdownFile.path,
					});
				});
			});

			updateReference({ references });
			const leaves = this.app.workspace.getLeavesOfType("markdown");

			leaves.forEach((leaf: WorkspaceLeaf) => {
				addReferencesToLeaf(leaf);
			});
		});
	}, 100);
}

export async function openReference() {
	const { workspace } = state.values[0].app;
	const leavesByTab = collectLeavesByTabHelper();

	const { tabIdx, index, dataString, leafId } = state.values[2];
	/* If temporary, then keep leaf */
	if (dataString) {
		let [prefix, text, suffix, file, from, to] = processURI(dataString);
		let rangeEnd = parseEditorPosition(to);
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
		editor.setCursor(rangeEnd);
		updateHover({
			leafId: null,
			originalTop: null,
		});
	}
}
