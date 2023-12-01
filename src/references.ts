import { App, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";

import {
	state,
	updateHover,
	updateReference,
	updateReferenceMarks,
	getReferenceMarks,
	getThat,
	getReferences,
} from "./state";
import {
	processURI,
	parseEditorPosition,
	encodeURIComponentString,
} from "./utils";
import { REFERENCE_REGEX } from "./constants";
import { collectLeavesByTabHelper } from "./leaves";

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

export function updateReferenceMarkPositions(
	leaf: any,
	editor: any,
	leafReferences: any
) {
	console.log("update!");
	console.log(leaf);

	const title = leaf.containerEl.querySelector(".inline-title");
	const titleBbox = title.getBoundingClientRect();
	const line = leaf.containerEl.querySelector(".cm-line");
	const lineBbox = line.getBoundingClientRect();

	let references = getReferenceMarks();
	console.log(references);

	leafReferences.forEach((reference: any) => {
		const { from, to } = reference;
		const rangeStart = parseEditorPosition(from);
		const rangeEnd = parseEditorPosition(to);
		const pos = editor.posToOffset(rangeStart);

		const bbox = editor.cm.coordsAtPos(pos);

		console.log("update leaf: " + leaf.id);
		console.log(references.filter((x: any) => x.id == leaf.id));
		let filteredReferences = references.filter((x: any) => x.id == leaf.id);
		let exists = filteredReferences
			.map((x: any) => x.reference)
			.indexOf(reference);
		if (exists != -1) {
			filteredReferences[exists].element.style.top =
				bbox.top - titleBbox.top + 20 + "px";
			filteredReferences[exists].element.style.left =
				lineBbox.width + 40 + "px";
		}
	});
}

export function createReferenceMarkPositions(
	leaf: any,
	editor: any,
	leafReferences: any
) {
	const title = leaf.containerEl.querySelector(".inline-title");
	const titleBbox = title.getBoundingClientRect();
	const line = leaf.containerEl.querySelector(".cm-line");
	const lineBbox = line.getBoundingClientRect();

	console.log(leaf);
	// let editor = leaf.view.editor;
	leafReferences.forEach((reference: any) => {
		console.log(reference);
		const { from, to } = reference;
		const rangeStart = parseEditorPosition(from);
		const rangeEnd = parseEditorPosition(to);
		const pos = editor.posToOffset(rangeStart);

		const bbox = editor.cm.coordsAtPos(pos);

		if (bbox) {
			let span = createReferenceIcon();
			updateReferenceMarks(span, reference, leaf.id);
			// const span = document.createElement("span");
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
	});
}

function addReferencesToLeaf(leaf: any) {
	const references = getReferences();
	console.log("REFERENCES");
	console.log(references);

	const title =
		leaf.containerEl.querySelector(".view-header-title").innerHTML + ".md";
	const leafReferences = references.filter((x: any) => x.file == title);

	console.log(leaf);
	console.log(leafReferences);

	let workspaceTabs = leaf.containerEl.closest(".workspace-tabs");

	createReferenceMarkPositions(leaf, leaf.view.editor, leafReferences);
	console.log("create leaf: " + leaf.id);
	let resizeObserver = new ResizeObserver(() => {
		console.log("Resize event!");
		const leaves = state.values[0].app.workspace.getLeavesOfType("markdown");
		console.log(leaves);
		const visibleLeaves = leaves.filter((leaf: any) =>
			leaf.tabHeaderEl.className.includes("is-active")
		);
		console.log(visibleLeaves);

		visibleLeaves.forEach((visibleLeaf: any) => {
			const title =
				visibleLeaf.containerEl.querySelector(".view-header-title").innerHTML +
				".md";
			console.log(title);
			const visibleLeafReferences = references.filter(
				(x: any) => x.file == title
			);
			console.log(visibleLeafReferences);
			console.log(visibleLeaf.view.editor);
			updateReferenceMarkPositions(
				visibleLeaf,
				visibleLeaf.view.editor,
				visibleLeafReferences
			);
		});
	});

	resizeObserver.observe(workspaceTabs);
}

export function generateReferences() {
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
			console.log(leaf);
			addReferencesToLeaf(leaf);
		});
	});
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
