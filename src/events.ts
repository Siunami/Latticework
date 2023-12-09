import {
	state,
	updateCursor,
	updateHover,
	getCursor,
	getHover,
	resetHover,
	resetCursor,
	getThat,
} from "./state";
import { ACTION_TYPE } from "./constants";
import {
	collectLeavesByTabHelper,
	getCurrentTabIndex,
	openFileInAdjacentTab,
} from "./workspace";
import {
	processURI,
	decodeURIComponentString,
	findTextPositions,
	listItemLength,
} from "./utils";
import {
	Editor,
	MarkdownEditView,
	MarkdownView,
	WorkspaceItem,
	WorkspaceLeaf,
} from "obsidian";
import { highlightSelection, removeHighlights } from "./mark";
import { EditorView } from "@codemirror/view";

function highlightHoveredReference(dataString: string, tabIdx: number) {
	let [prefix, text, suffix, file, from, to] = processURI(dataString);

	const leavesByTab = collectLeavesByTabHelper();
	let index = leavesByTab[tabIdx]
		.map((leaf: any) => leaf.getViewState())
		.findIndex((x: any) => x.state.file == file);
	if (index != -1) {
		let targetLeaf: WorkspaceLeaf = leavesByTab[tabIdx][index];

		// @ts-ignore
		const editor = targetLeaf.view.editor;
		/*
		{
			"top": 0,
			"left": 0,
			"clientHeight": 1311,
			"clientWidth": 1063,
			"height": 1311,
			"width": 1078
		}
		*/
		let positions = findTextPositions(
			targetLeaf.view,
			text,
			prefix.slice(0, prefix.length - 1),
			suffix.slice(1, suffix.length)
		);
		console.log(positions);
		if (!positions) return;
		let rangeStart = positions.rangeStart;
		let rangeEnd = positions.rangeEnd;

		const originalScroll = editor.getScrollInfo();
		const originalCursor = editor.getCursor();

		const ranges = [];

		let lines = text.split("\n");
		let currIndex = 0;

		// function shiftIfBullet(rangeStart) {}

		if (rangeStart.line != rangeEnd.line) {
			let start = rangeStart.line;
			let end = rangeEnd.line;
			let curr = start;
			while (curr <= end) {
				if (curr == start) {
					editor.replaceRange(
						`+++${decodeURIComponentString(lines[currIndex])}+++`,
						rangeStart,
						{
							line: curr,
							ch: editor.getLine(curr).length,
						}
					);
					ranges.push([
						lines[currIndex],
						rangeStart,
						{
							line: curr,
							ch: editor.getLine(curr).length,
						},
					]);
					curr++;
				} else if (curr == end) {
					let listItemIndex = listItemLength(lines[currIndex]);
					let listItemText = lines[currIndex].slice(
						listItemIndex,
						lines[currIndex].length
					);
					editor.replaceRange(
						`+++${decodeURIComponentString(listItemText)}+++`,
						{
							line: curr,
							ch: listItemIndex,
						},
						rangeEnd
					);
					ranges.push([
						listItemText,
						{
							line: curr,
							ch: listItemIndex,
						},
						Object.assign({}, rangeEnd, { ch: rangeEnd.ch + 6 }),
					]);
					curr++;
				} else {
					let listItemIndex = listItemLength(lines[currIndex]);
					let listItemText = lines[currIndex].slice(
						listItemIndex,
						lines[currIndex].length
					);
					editor.replaceRange(
						`+++${decodeURIComponentString(listItemText)}+++`,
						{
							line: curr,
							ch: listItemIndex,
						},
						{
							line: curr,
							ch: editor.getLine(curr).length,
						}
					);
					ranges.push([
						listItemText,
						{
							line: curr,
							ch: listItemIndex,
						},
						{
							line: curr,
							ch: editor.getLine(curr).length,
						},
					]);
					curr++;
				}
				currIndex++;
			}
		} else {
			editor.replaceRange(
				`+++${decodeURIComponentString(text)}+++`,
				rangeStart,
				rangeEnd
			);
			ranges.push([
				text,
				rangeStart,
				Object.assign({}, rangeEnd, { ch: rangeEnd.ch + 6 }),
			]);
		}

		editor.scrollIntoView(
			{
				from: rangeStart,
				to: rangeEnd,
			},
			true
		);
		return {
			tabIdx,
			index,
			dataString,
			originalTop: originalScroll.top,
			originalCursor,
			ranges,
		};
	}
	return null;
}

function getEditorView(leaf: WorkspaceLeaf) {
	const view = leaf.view;

	// @ts-ignore
	const editor = view.sourceMode?.cmEditor;

	// 'editor' here is an instance of 'Editor', an abstraction over CM5 and CM6.
	// Checking for 'CodeMirror' would indicate CM5.
	if (!editor.CodeMirror && editor.cm instanceof EditorView) {
		// You now have access to the CodeMirror 6 EditorView instance.
		const editorView = editor.cm;

		return editorView;

		// You can now use the CodeMirror 6 API with `editorView`.
	}
	return null;
}

export async function startReferenceEffect(
	span: HTMLSpanElement,
	type: string
) {
	let source = type == ACTION_TYPE.MOUSE ? getHover() : getCursor();
	let destination = type == ACTION_TYPE.MOUSE ? getCursor() : getHover();
	let updateState = type == ACTION_TYPE.MOUSE ? updateHover : updateCursor;
	let getState = type == ACTION_TYPE.MOUSE ? getHover : getCursor;
	let resetState = type == ACTION_TYPE.MOUSE ? resetHover : resetCursor;

	console.log(updateState);

	// Mutex, prevent concurrent access to following section of code
	if (source != null) return;
	updateState({
		type: `${type}-start`,
	});

	const dataString = span.getAttribute("data");
	if (!dataString) return;

	if (destination != null && destination.dataString == dataString) {
		updateHover(destination);
		return;
	}

	let [prefix, text, suffix, file, from, to] = processURI(dataString);

	let leavesByTab = collectLeavesByTabHelper();

	let currTabIdx = getCurrentTabIndex(leavesByTab, span);

	// if (currTabIdx != -1) {
	// && currTab != -1) {
	// // Check adjacent tabs for file and open file if needed
	const { newLeaf, temp } = await openFileInAdjacentTab(
		leavesByTab,
		currTabIdx,
		file
	);

	// @ts-ignore
	let id = newLeaf.id;
	if (!id) throw new Error("Leaf id not found");
	updateState({
		leafId: id,
		temp,
	});

	if (newLeaf && newLeaf.view instanceof MarkdownView) {
		// @ts-ignore
		let id = newLeaf.id;

		const editorView: EditorView = getEditorView(newLeaf);
		if (!editorView) throw new Error("Editor view not found");
		const viewport = newLeaf.view.editor.getScrollInfo();

		highlightSelection(editorView, from, to);
		let positions = findTextPositions(
			newLeaf.view,
			text,
			prefix.slice(0, prefix.length - 1),
			suffix.slice(1, suffix.length)
		);
		if (!positions) throw new Error("Positions not found");
		let rangeStart = positions.rangeStart;
		let rangeEnd = positions.rangeEnd;

		newLeaf.view.editor.scrollIntoView(
			{
				from: rangeStart,
				to: rangeEnd,
			},
			true
		);

		updateState({
			dataString,
			id,
			originalTop: editorView.documentTop,
			viewport,
		});
	}
}

export async function endReferenceCursorEffect() {
	if (!getCursor() || Object.keys(getCursor()).length == 0) {
		// End mutex lock
		resetCursor();
		return;
	}

	const { dataString, id, leafId, originalTop, temp, viewport } = getCursor();
	if (getHover() != null && getHover().dataString == dataString) {
		// End mutex lock
		resetCursor();
		return;
	}

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(id);
	let editorView = getEditorView(targetLeaf);

	removeHighlights(editorView);

	if (temp) {
		setTimeout(() => {
			targetLeaf.detach();
		}, 100);
	} else {
		let originalLeaf = workspace.getLeafById(leafId);
		if (!originalLeaf) throw new Error("Original leaf not found");

		if (originalLeaf && originalLeaf.view instanceof MarkdownView) {
			const view: MarkdownView = originalLeaf.view;
			view.editor.scrollTo(0, viewport.top);
		}
	}

	// End mutex lock
	resetCursor();
}

export async function endReferenceHoverEffect() {
	if (!getHover() || Object.keys(getHover()).length == 0) {
		// End mutex lock
		resetHover();
		return;
	}

	const { dataString, id, leafId, originalTop, temp, viewport } = getHover();
	if (getCursor() != null && getCursor().dataString == dataString) {
		// End mutex lock
		resetHover();
		return;
	}

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(id);
	let editorView: EditorView = getEditorView(targetLeaf);

	removeHighlights(editorView);

	if (temp) {
		setTimeout(() => {
			targetLeaf.detach();
		}, 100);
	} else {
		let originalLeaf = workspace.getLeafById(leafId);
		if (!originalLeaf) throw new Error("Original leaf not found");

		if (originalLeaf && originalLeaf.view instanceof MarkdownView) {
			const view: MarkdownView = originalLeaf.view;

			// scroll back to source prior to hover
			view.editor.scrollTo(0, viewport.top);

			// if the cursor is active, highlight the selection
			if (getCursor() != null) {
				const { dataString } = getCursor();
				let [prefix, text, suffix, file, from, to] = processURI(dataString);
				const editorView: EditorView = getEditorView(originalLeaf);
				highlightSelection(editorView, from, to);
			}
		}
	}

	// End mutex lock
	resetHover();
}

// export async function endReferenceCursorEffect() {
// 	const leavesByTab = collectLeavesByTabHelper();
// 	if (!getCursor() || Object.keys(getCursor()).length == 0) {
// 		// End mutex lock
// 		resetCursor();
// 		return;
// 	}

// 	const {
// 		tabIdx,
// 		index,
// 		dataString,
// 		leafId,
// 		originalTop,
// 		originalCursor,
// 		ranges,
// 	} = getCursor();

// 	if (getHover() != null && getHover().dataString == dataString) {
// 		// End mutex lock
// 		resetCursor();
// 		return;
// 	}
// 	if (
// 		!leavesByTab[tabIdx] ||
// 		!leavesByTab[tabIdx] ||
// 		!leavesByTab[tabIdx][index]
// 	) {
// 		// End mutex lock
// 		resetCursor();
// 		return;
// 	}

// 	let targetLeaf = leavesByTab[tabIdx][index];
// 	// this.app.workspace.setActiveLeaf(targetLeaf);

// 	// @ts-ignore
// 	const editor = targetLeaf.view.editor;
// 	if (ranges) {
// 		ranges.forEach((range: any[]) => {
// 			editor.replaceRange(range[0], range[1], range[2]);
// 		});
// 	}
// 	editor.scrollIntoView(
// 		{
// 			from: ranges[0][1],
// 			to: ranges[ranges.length - 1][2],
// 		},
// 		true
// 	);

// 	if (leafId) {
// 		setTimeout(() => {
// 			targetLeaf.detach();
// 		}, 100);
// 	}

// 	// End mutex lock
// 	resetCursor();
// }
