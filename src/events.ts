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

export async function startBacklinkEffect(span: HTMLSpanElement) {
	let source = getHover();
	let destination = getCursor();
	let updateState = updateHover;

	// Mutex, prevent concurrent access to following section of code
	if (source != null) return;
	updateState({
		type: `${ACTION_TYPE.MOUSE}-start`,
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

		newLeaf.view.editor.scrollIntoView({
			from: rangeStart,
			to: rangeEnd,
		});
	}
}

export async function startReferenceEffect(
	span: HTMLSpanElement,
	type: string
) {
	let source = type == ACTION_TYPE.MOUSE ? getHover() : getCursor();
	let destination = type == ACTION_TYPE.MOUSE ? getCursor() : getHover();
	let updateState = type == ACTION_TYPE.MOUSE ? updateHover : updateCursor;
	// let getState = type == ACTION_TYPE.MOUSE ? getHover : getCursor;
	let resetState = type == ACTION_TYPE.MOUSE ? resetHover : resetCursor;

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

	let currLeaf = getThat().workspace.getLeaf();

	// @ts-ignore
	let currLeafID = currLeaf.id;
	if (!currLeafID) throw new Error("currLeafID id not found");

	// if (currTabIdx != -1) {
	// && currTab != -1) {
	// // Check adjacent tabs for file and open file if needed
	const { newLeaf, temp } = await openFileInAdjacentTab(
		leavesByTab,
		currTabIdx,
		file,
		type
	);
	// if (!newLeaf) {
	// 	resetState();
	// 	return;
	// }

	// @ts-ignore
	let id = newLeaf.id;
	if (!id) throw new Error("Leaf id not found");
	updateState({
		leafId: id,
		temp,
	});

	if (temp) newLeaf.containerEl.style.opacity = "0.7";

	if (newLeaf && newLeaf.view instanceof MarkdownView) {
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

		const cursorViewport = newLeaf.view.editor.getScrollInfo();

		updateState({
			dataString,
			originalTop: editorView.documentTop,
			originalLeafId: currLeafID,
			cursorViewport,
		});
	}
}

export async function endReferenceCursorEffect() {
	if (!getCursor() || Object.keys(getCursor()).length == 0) {
		// End mutex lock
		resetCursor();
		return;
	}

	const { dataString, leafId, originalTop, temp, viewport } = getCursor();
	if (getHover() != null && getHover().dataString == dataString) {
		// End mutex lock
		resetCursor();
		return;
	}

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(leafId);
	let editorView = getEditorView(targetLeaf);

	removeHighlights(editorView);

	if (temp) {
		targetLeaf.detach();
		// setTimeout(() => {
		// 	targetLeaf.detach();
		// }, 100);
	} else if (viewport) {
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

	const { dataString, leafId, originalTop, originalLeafId, temp, viewport } =
		getHover();
	if (getCursor() != null && getCursor().dataString == dataString) {
		// End mutex lock
		resetHover();
		return;
	}

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(leafId);
	let editorView: EditorView = getEditorView(targetLeaf);

	removeHighlights(editorView);

	if (temp) {
		targetLeaf.detach();
		let originalLeaf = workspace.getLeafById(originalLeafId);
		if (!originalLeaf) throw new Error("Original leaf not found");

		workspace.revealLeaf(originalLeaf);
	} else if (viewport) {
		let newLeaf = workspace.getLeafById(leafId);
		if (!newLeaf) throw new Error("New leaf not found");

		if (newLeaf && newLeaf.view instanceof MarkdownView) {
			const view: MarkdownView = newLeaf.view;

			// scroll back to source prior to hover
			view.editor.scrollTo(0, viewport.top);

			// if the cursor is active, highlight the selection
			if (getCursor() != null) {
				const { dataString, cursorViewport, id } = getCursor();
				let [prefix, text, suffix, file, from, to] = processURI(dataString);
				const editorView: EditorView = getEditorView(newLeaf);
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
