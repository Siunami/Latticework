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
import { REFERENCE_REGEX, SVG_HOVER_COLOR } from "./constants";
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

		/* 
		When the range in the reference text doesn't match,
		This means that the text has updated
		Find the new range position if possible
		Otherwise (future) remove the reference mark
		*/
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
		if (exists != -1 && bbox) {
			filteredReferences[exists].element.style.top =
				bbox.top - titleBbox.top + 32 + "px";
			filteredReferences[exists].element.style.left =
				lineBbox.width + 40 + "px";
		}
	});
}

export function updateReferenceMarkPositions(
	references: any = getReferences()
) {
	const { workspace } = getThat().app;
	const leaves = workspace.getLeavesOfType("markdown");
	const visibleLeaves = leaves.filter((leaf: any) =>
		leaf.tabHeaderEl.className.includes("is-active")
	);

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

	const { from, to } = reference;
	const rangeStart = parseEditorPosition(from);
	const rangeEnd = parseEditorPosition(to);
	console.log(rangeStart);

	const pos = editor.posToOffset(rangeStart);
	const bbox = editor.cm.coordsAtPos(pos);

	if (bbox) {
		let { span, svg } = createReferenceIcon();
		updateReferenceMarks(span, reference, leaf.id);
		span.style.color = "black";
		span.style.position = "absolute";
		span.style.top = bbox.top - titleBbox.top + 20 + "px";
		span.style.left = lineBbox.width + 40 + "px";
		span.setAttribute("reference", JSON.stringify(reference));

		span.addEventListener("click", async () => {
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
	console.log(leaf.view.file);
	// const title =
	// 	leaf.containerEl.querySelector(".view-header-title").innerHTML + ".md";
	const title = leaf.view.file.name;
	const leafReferences = references.filter((x: any) => x.file == title);
	let workspaceTabs = leaf.containerEl.closest(".workspace-tabs");

	leaf.view.editor.containerEl
		.querySelector(".cm-scroller")
		.addEventListener("scroll", () => {
			createReferenceMarkPositions(leaf, leaf.view.editor, leafReferences);
			updateReferenceMarkPositions(references);
		});

	createReferenceMarkPositions(leaf, leaf.view.editor, leafReferences);
	updateReferenceMarkPositions(references);
	let resizeObserver = new ResizeObserver(() => {
		updateReferenceMarkPositions(references);
	});

	resizeObserver.observe(workspaceTabs);
}

let debounceTimer: NodeJS.Timeout;
export function generateReferences() {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
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
