import {
	state,
	updateCursor,
	updateHover,
	getCursor,
	getHover,
	resetHover,
	resetCursor,
	getThat,
	getBacklinkHover,
	updateBacklinkHover,
	resetBacklinkHover,
	updateHoveredCursor,
} from "./state";
import { ACTION_TYPE, SVG_HOVER_COLOR } from "./constants";
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
	handleRemoveHoveredCursor,
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
	if (!leaf) return null;
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

function checkSpanElementExists(
	span: HTMLSpanElement,
	containerEl: HTMLElement
): boolean {
	const spanElements = containerEl.getElementsByTagName("span");
	for (let i = 0; i < spanElements.length; i++) {
		if (spanElements[i] === span) {
			return true;
		}
	}
	return false;
}

export async function startBacklinkEffect(span: HTMLSpanElement) {
	let source = getBacklinkHover();
	let destination = getCursor();
	let updateState = updateBacklinkHover;

	// Mutex, prevent concurrent access to following section of code
	if (source != null) return;
	updateState({
		type: `${ACTION_TYPE.BACKLINK}-start`,
	});

	const referenceData = span.getAttribute("reference");
	if (!referenceData) throw new Error("Reference data not found");

	const backlink = JSON.parse(referenceData);
	const dataString = backlink.dataString;

	if (destination != null && destination.dataString == dataString) {
		updateState(destination);
		return;
	}

	let [prefix, text, suffix, file, from, to] = processURI(dataString);

	let leavesByTab = collectLeavesByTabHelper();

	let currTabIdx = getCurrentTabIndex(leavesByTab, span);

	let backlinkLeaf = leavesByTab[currTabIdx].filter((leaf: WorkspaceLeaf) => {
		// @ts-ignore
		let containerEl = leaf.containerEl;
		const exists = checkSpanElementExists(span, containerEl);
		return exists;
	})[0];

	// @ts-ignore
	let backlinkLeafID = backlinkLeaf.id;
	if (!backlinkLeafID) throw new Error("Leaf id not found");

	if (backlinkLeaf && backlinkLeaf.view instanceof MarkdownView) {
		const editorView: EditorView = getEditorView(backlinkLeaf);
		if (!editorView) throw new Error("Editor view not found");
		const viewport = backlinkLeaf.view.editor.getScrollInfo();
		// highlightSelection(editorView, from, to);
		// let positions = findTextPositions(
		// 	backlinkLeaf.view.data,
		// 	text,
		// 	prefix.slice(0, prefix.length - 1),
		// 	suffix.slice(1, suffix.length)
		// );
		// if (!positions) throw new Error("Positions not found");
		updateState({
			dataString,
			originalTop: editorView.documentTop,
			originalLeafId: backlinkLeafID,
		});
	}

	let referencingFile = backlink.referencingLocation.filename;

	// if (currTabIdx != -1) {
	// && currTab != -1) {
	// // Check adjacent tabs for file and open file if needed
	const { newLeaf, temp } = await openFileInAdjacentTab(
		leavesByTab,
		currTabIdx,
		referencingFile
	);

	// @ts-ignore
	let id = newLeaf.id;
	if (!id) throw new Error("Leaf id not found");
	updateState({
		leafId: id,
		temp,
	});

	if (temp) {
		// newLeaf.containerEl.style.opacity = "0.7";
		newLeaf.containerEl.querySelector(".view-content").style.boxShadow =
			"inset 0px 0px 10px 10px rgba(248, 255, 255)";
	}

	let backlinkSpan: HTMLSpanElement = newLeaf.containerEl.querySelector(
		`span[data="${backlink.dataString}"]`
	);

	if (backlinkSpan) {
		// backlinkSpan.scrollIntoView({
		// 	behavior: "smooth",
		// 	block: "center",
		// 	inline: "center",
		// });
		const svgElement = backlinkSpan.querySelector("svg");
		if (svgElement) {
			svgElement.style.borderRadius = "5px";
			svgElement.style.boxShadow = `0px 0px 10px 10px ${SVG_HOVER_COLOR}`;
			updateHoveredCursor(svgElement, ACTION_TYPE.BACKLINK);
		}
	}

	return;
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
	const { newLeaf, temp, originalTab } = await openFileInAdjacentTab(
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

	if (temp) {
		// newLeaf.containerEl.style.opacity = "0.7";
		newLeaf.containerEl.querySelector(".view-content").style.boxShadow =
			"inset 0px 0px 10px 10px rgba(248, 255, 255)";
	}

	if (newLeaf && newLeaf.view instanceof MarkdownView) {
		const editorView: EditorView = getEditorView(newLeaf);
		if (!editorView) throw new Error("Editor view not found");
		const viewport = newLeaf.view.editor.getScrollInfo();

		highlightSelection(editorView, from, to);
		let positions = findTextPositions(
			newLeaf.view.data,
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
			// originalLeafId: currLeafID,
			cursorViewport,
		});
	}

	// @ts-ignore
	const originalLeafId = originalTab.id;
	updateState({
		originalLeafId,
	});
}

export async function endReferenceCursorEffect() {
	if (!getCursor() || Object.keys(getCursor()).length == 0) {
		// End mutex lock
		resetCursor();
		return;
	}

	const { dataString, leafId, originalLeafId, temp, cursorViewport } =
		getCursor();
	if (getHover() != null && getHover().dataString == dataString) {
		// End mutex lock1
		resetCursor();
		return;
	}

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(leafId);
	if (!targetLeaf) throw new Error("Target leaf not found");
	let editorView = getEditorView(targetLeaf);

	removeHighlights(editorView);

	if (cursorViewport && targetLeaf && targetLeaf.view instanceof MarkdownView) {
		const view: MarkdownView = targetLeaf.view;
		view.editor.scrollTo(0, cursorViewport.top);

		// const result = await new Promise((resolve) => {
		// 	const scrolling = setInterval(() => {
		// 		const scrollAmount = 40;
		// 		const currentScroll = view.editor.getScrollInfo().top;
		// 		if (currentScroll == cursorViewport.top) {
		// 			clearInterval(scrolling);
		// 		} else if (currentScroll > cursorViewport.top) {
		// 			if (currentScroll - scrollAmount < cursorViewport.top) {
		// 				view.editor.scrollTo(0, cursorViewport.top);
		// 				clearInterval(scrolling);
		// 				resolve("done");
		// 			} else {
		// 				view.editor.scrollTo(0, currentScroll - scrollAmount);
		// 			}
		// 		} else if (currentScroll < cursorViewport.top) {
		// 			if (currentScroll + scrollAmount > cursorViewport.top) {
		// 				view.editor.scrollTo(0, cursorViewport.top);
		// 				clearInterval(scrolling);
		// 				resolve("done");
		// 			} else {
		// 				view.editor.scrollTo(0, currentScroll + scrollAmount);
		// 			}
		// 		}
		// 	}, 10);
		// });

		// view.containerEl.querySelector(".cm-scroller")?.scrollTo({
		// 	top: cursorViewport.top,
		// 	behavior: "smooth",
		// });

		// if the hover is active, highlight the selection
		if (getHover() != null) {
			const { dataString, cursorViewport, leafId, originalLeafId } = getHover();
			let [prefix, text, suffix, file, from, to] = processURI(dataString);
			const cursorLeaf = workspace.getLeafById(leafId);
			console.log(cursorLeaf);
			workspace.revealLeaf(cursorLeaf);
			const editorView: EditorView = getEditorView(cursorLeaf);
			highlightSelection(editorView, from, to);
		}
	}

	if (temp && targetLeaf) {
		targetLeaf.detach();
	}

	// if (!temp) {
	// 	let originalLeaf = workspace.getLeafById(originalLeafId);
	// 	if (!originalLeaf) throw new Error("Original leaf not found");

	// 	workspace.revealLeaf(originalLeaf);
	// }
	// End mutex lock
	resetCursor();
}

export async function endReferenceHoverEffect() {
	console.log("endReferenceHoverEffect");
	if (!getHover() || Object.keys(getHover()).length == 0) {
		// End mutex lock
		resetHover();
		return;
	}

	const { dataString, leafId, originalLeafId, temp, cursorViewport } =
		getHover();
	if (getCursor() != null && getCursor().dataString == dataString) {
		console.log("cursor reset");
		// End mutex lock
		resetHover();
		return;
	}

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(leafId);
	if (!targetLeaf) throw new Error("Target leaf not found");
	let editorView = getEditorView(targetLeaf);

	removeHighlights(editorView);

	if (cursorViewport && targetLeaf && targetLeaf.view instanceof MarkdownView) {
		const view: MarkdownView = targetLeaf.view;
		view.editor.scrollTo(0, cursorViewport.top);

		// const currentScroll = view.editor.getScrollInfo().top;
		// const result = await new Promise((resolve) => {
		// 	const scrolling = setInterval(() => {
		// 		const scrollAmount = 40;
		// 		const currentScroll = view.editor.getScrollInfo().top;
		// 		if (currentScroll == cursorViewport.top) {
		// 			clearInterval(scrolling);
		// 		} else if (currentScroll > cursorViewport.top) {
		// 			if (currentScroll - scrollAmount < cursorViewport.top) {
		// 				view.editor.scrollTo(0, cursorViewport.top);
		// 				clearInterval(scrolling);
		// 				resolve("done");
		// 			} else {
		// 				view.editor.scrollTo(0, currentScroll - scrollAmount);
		// 			}
		// 		} else if (currentScroll < cursorViewport.top) {
		// 			if (currentScroll + scrollAmount > cursorViewport.top) {
		// 				view.editor.scrollTo(0, cursorViewport.top);
		// 				clearInterval(scrolling);
		// 				resolve("done");
		// 			} else {
		// 				view.editor.scrollTo(0, currentScroll + scrollAmount);
		// 			}
		// 		}
		// 	}, 10);
		// });

		// view.containerEl.querySelector(".cm-scroller")?.scrollTo({
		// 	top: cursorViewport.top,
		// 	behavior: "smooth",
		// });

		// if the cursor is active, highlight the selection
		if (getCursor() != null) {
			const { dataString, cursorViewport, leafId, originalLeafId } =
				getCursor();
			let [prefix, text, suffix, file, from, to] = processURI(dataString);
			const cursorLeaf = workspace.getLeafById(leafId);
			workspace.revealLeaf(cursorLeaf);
			const editorView: EditorView = getEditorView(cursorLeaf);
			highlightSelection(editorView, from, to);
		}
	}

	if (temp && targetLeaf) {
		targetLeaf.detach();
	}

	// if (!temp) {
	// 	let originalLeaf = workspace.getLeafById(originalLeafId);
	// 	if (!originalLeaf) throw new Error("Original leaf not found");

	// 	workspace.revealLeaf(originalLeaf);
	// }

	// End mutex lock
	resetHover();
}

export async function endBacklinkHoverEffect() {
	if (!getBacklinkHover() || Object.keys(getBacklinkHover()).length == 0) {
		// End mutex lock
		resetBacklinkHover();
		return;
	}

	const {
		dataString,
		leafId,
		originalLeafId,
		temp,
		cursorViewport,
		originalTab,
	} = getBacklinkHover();
	if (getCursor() != null && getCursor().dataString == dataString) {
		// End mutex lock
		resetBacklinkHover();
		return;
	}

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(leafId);
	let editorView: EditorView = getEditorView(targetLeaf);

	removeHighlights(editorView);

	// backlink effect
	const originalLeaf = workspace.getLeafById(originalLeafId);
	if (!originalLeaf) {
		resetBacklinkHover();
		throw new Error("Original leaf not found");
	}
	let originalEditorView: EditorView = getEditorView(originalLeaf);

	removeHighlights(originalEditorView);

	if (getCursor() != null) {
		const { dataString, cursorViewport, leafId, originalLeafId } = getCursor();
		let [prefix, text, suffix, file, from, to] = processURI(dataString);
		const cursorLeaf = workspace.getLeafById(leafId);
		workspace.revealLeaf(cursorLeaf);

		const editorView: EditorView = getEditorView(cursorLeaf);
		highlightSelection(editorView, from, to);
	}

	if (temp && targetLeaf) {
		targetLeaf.detach();
	}

	handleRemoveHoveredCursor(ACTION_TYPE.BACKLINK);

	// if (temp) {
	// 	targetLeaf.detach();
	// 	// setTimeout(() => {
	// 	// 	targetLeaf.detach();
	// 	// }, 100);
	// } else {
	// 	// if the cursor is active, highlight the selection
	// }

	// End mutex lock
	resetBacklinkHover();
}
