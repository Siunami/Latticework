import {
	updateHover,
	getHover,
	resetHover,
	getThat,
	getBacklinkHover,
	updateBacklinkHover,
	resetBacklinkHover,
} from "./state";
import { ACTION_TYPE, REFERENCE_REGEX } from "./constants";
import {
	collectLeavesByTabHelper,
	getCurrentTabIndex,
	openFileInAdjacentTab,
} from "./workspace";
import { processURI, findTextPositions } from "./utils";
import { MarkdownView, Workspace, WorkspaceLeaf } from "obsidian";
import {
	defaultHighlightSelection,
	highlightSelection,
	removeHighlight,
	removeHighlights,
} from "./mark";
import { EditorView } from "@codemirror/view";
import {
	getBacklinkContainer,
	getContainerElement,
	getMarkdownView,
} from "./references";

export function getEditorView(leaf: WorkspaceLeaf) {
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

function parseCSSString(css: string) {
	// Use a regular expression to match key-value pairs in the CSS string
	const cssPropertiesRegex = /([\w-]+)\s*:\s*([^;]+)\s*;?/g;

	// Initialize an empty object to store the CSS properties
	let cssPropertiesObject: any = {};

	// Iterate over all key-value pairs found by the regex
	let match;
	while ((match = cssPropertiesRegex.exec(css)) !== null) {
		// match[1] is the key
		// match[2] is the value
		cssPropertiesObject[match[1]] = match[2];
	}

	return cssPropertiesObject;
}

export function delay(milliseconds: any) {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}

function tempDirectionIndicator(
	leaf: any,
	text: string,
	prefix: string,
	suffix: string,
	dataString: string,
	isSame: boolean,
	user?: string
) {
	const editor = getMarkdownView(leaf).editor;

	const scroller = leaf.view.containerEl.querySelector(".cm-scroller");
	const windowHeight = scroller.getBoundingClientRect().height;
	const scrollTop =
		leaf.view.containerEl.querySelector(".cm-scroller").scrollTop;
	const scrollBottom = scrollTop + windowHeight;

	let references;

	if (user === ACTION_TYPE.BACKLINK) {
		// Get the elements that are between the top and bottom of the screen
		// @ts-ignore
		let container = editor.containerEl;
		let content = container.querySelector(".cm-content");
		references = content.querySelectorAll(".reference-data-span");
	} else {
		references = leaf.containerEl.querySelectorAll(".reference-data-span");
	}

	let visibleElements: HTMLElement[] = [];
	for (let i = 0; i < references.length; i++) {
		let bbox = references[i].getBoundingClientRect();

		if (
			bbox.top + scroller.scrollTop >= scrollTop &&
			bbox.top + bbox.height + scroller.scrollTop <= scrollBottom
		) {
			visibleElements.push(references[i]);
		}
	}

	let dataStrings = visibleElements.map((el: HTMLElement) => {
		if (user === ACTION_TYPE.BACKLINK) {
			return el.getAttribute("data");
		} else {
			let reference = el.getAttribute("reference");
			if (reference) {
				return JSON.parse(reference).dataString;
			}
		}
	});

	let startTop = leaf.view.editor.getScrollInfo().top;

	if (!dataStrings.includes(dataString)) {
		let positions = findTextPositions(
			leaf.view.data,
			text,
			prefix.slice(0, prefix.length - 1),
			suffix.slice(1, suffix.length)
		);
		if (!positions) throw new Error("Positions not found");
		let rangeStart = positions.rangeStart;
		let rangeEnd = positions.rangeEnd;

		leaf.view.editor.scrollIntoView(
			{
				from: Object.assign(rangeStart, { ch: 0 }),
				to: Object.assign(rangeEnd, { ch: 0 }),
			},
			true
		);
	}

	setTimeout(() => {
		// if (temp) return;
		let endTop = leaf.view.editor.getScrollInfo().top;

		let container = leaf.containerEl.querySelector(".view-content");
		container.classList.remove("no-shadow");
		container.classList.remove("new-shadow");
		container.classList.remove("top-shadow");
		container.classList.remove("bottom-shadow");

		if (startTop === endTop && isSame) {
			container.classList.add("no-shadow");
		} else if (startTop === endTop && !isSame) {
			container.classList.add("new-shadow");
		} else if (startTop < endTop) {
			// show mark above
			container.classList.add("top-shadow");
		} else {
			// show mark below
			container.classList.add("bottom-shadow");
		}
	}, 25);

	return;
}

// function tempDirectionIndicator2(
// 	leaf: any,
// 	text: string,
// 	prefix: string,
// 	suffix: string,
// 	dataString: string,
// 	isSame: boolean,
// 	user?: string
// ) {
// 	if (user === ACTION_TYPE.BACKLINK) {
// 		// Oh! I’d compare the bbox of the range
// 		// (which I know you find in the mark layout routine)
// 		// to the scrollTop + innerHeight
// 		const editor = getMarkdownView(leaf).editor;

// 		const scroller = leaf.view.containerEl.querySelector(".cm-scroller");
// 		const windowHeight = scroller.getBoundingClientRect().height;
// 		const scrollTop =
// 			leaf.view.containerEl.querySelector(".cm-scroller").scrollTop;
// 		const scrollBottom = scrollTop + windowHeight;

// 		// Get the elements that are between the top and bottom of the screen
// 		// @ts-ignore
// 		let container = editor.containerEl;
// 		let content = container.querySelector(".cm-content");
// 		let references = content.querySelectorAll(".reference-data-span");

// 		let visibleElements: HTMLElement[] = [];
// 		for (let i = 0; i < references.length; i++) {
// 			let bbox = references[i].getBoundingClientRect();

// 			if (
// 				bbox.top + scroller.scrollTop >= scrollTop &&
// 				bbox.top + bbox.height + scroller.scrollTop <= scrollBottom
// 			) {
// 				visibleElements.push(references[i]);
// 			}
// 		}

// 		let dataStrings = visibleElements.map((el: HTMLElement) =>
// 			el.getAttribute("data")
// 		);

// 		let startTop = leaf.view.editor.getScrollInfo().top;

// 		if (!dataStrings.includes(dataString)) {
// 			let positions = findTextPositions(
// 				leaf.view.data,
// 				text,
// 				prefix.slice(0, prefix.length - 1),
// 				suffix.slice(1, suffix.length)
// 			);
// 			if (!positions) throw new Error("Positions not found");
// 			let rangeStart = positions.rangeStart;
// 			let rangeEnd = positions.rangeEnd;

// 			leaf.view.editor.scrollIntoView(
// 				{
// 					from: Object.assign(rangeStart, { ch: 0 }),
// 					to: Object.assign(rangeEnd, { ch: 0 }),
// 				},
// 				true
// 			);
// 		}

// 		setTimeout(() => {
// 			// if (temp) return;
// 			let endTop = leaf.view.editor.getScrollInfo().top;

// 			let container = leaf.containerEl.querySelector(".view-content");
// 			container.classList.remove("no-shadow");
// 			container.classList.remove("new-shadow");
// 			container.classList.remove("top-shadow");
// 			container.classList.remove("bottom-shadow");

// 			if (startTop === endTop && isSame) {
// 				container.classList.add("no-shadow");
// 			} else if (startTop === endTop && !isSame) {
// 				container.classList.add("new-shadow");
// 			} else if (startTop < endTop) {
// 				// show mark above
// 				container.classList.add("top-shadow");
// 			} else {
// 				// show mark below
// 				container.classList.add("bottom-shadow");
// 			}
// 		}, 25);

// 		return;
// 	}

// 	// Oh! I’d compare the bbox of the range
// 	// (which I know you find in the mark layout routine)
// 	// to the scrollTop + innerHeight
// 	const editor = getMarkdownView(leaf).editor;
// 	const backlinkContainer = getBacklinkContainer(editor);

// 	const scroller = leaf.view.containerEl.querySelector(".cm-scroller");
// 	const windowHeight = scroller.getBoundingClientRect().height;
// 	const scrollTop =
// 		leaf.view.containerEl.querySelector(".cm-scroller").scrollTop;
// 	const scrollBottom = scrollTop + windowHeight;

// 	// Get the elements that are between the top and bottom of the screen
// 	let visibleElements: HTMLElement[] = [];
// 	for (let i = 0; i < backlinkContainer.children.length; i++) {
// 		let bbox = backlinkContainer.children[i].getBoundingClientRect();

// 		if (
// 			bbox.top + scroller.scrollTop >= scrollTop &&
// 			bbox.top + bbox.height + scroller.scrollTop <= scrollBottom
// 		) {
// 			visibleElements.push(backlinkContainer.children[i] as HTMLElement);
// 		}
// 	}

// 	let dataStrings = visibleElements.map((el: HTMLElement) => {
// 		let reference = el.getAttribute("reference");
// 		if (reference) {
// 			return JSON.parse(reference).dataString;
// 		}
// 	});

// 	let startTop = leaf.view.editor.getScrollInfo().top;
// 	if (!dataStrings.includes(dataString)) {
// 		let positions = findTextPositions(
// 			leaf.view.data,
// 			text,
// 			prefix.slice(0, prefix.length - 1),
// 			suffix.slice(1, suffix.length)
// 		);
// 		if (!positions) throw new Error("Positions not found");
// 		let rangeStart = positions.rangeStart;
// 		let rangeEnd = positions.rangeEnd;

// 		leaf.view.editor.scrollIntoView(
// 			{
// 				from: Object.assign(rangeStart, { ch: 0 }),
// 				to: Object.assign(rangeEnd, { ch: 0 }),
// 			},
// 			true
// 		);
// 	}
// 	setTimeout(() => {
// 		// if (temp) return;
// 		let endTop = leaf.view.editor.getScrollInfo().top;

// 		let container = leaf.containerEl.querySelector(".view-content");
// 		container.classList.remove("no-shadow");
// 		container.classList.remove("new-shadow");
// 		container.classList.remove("top-shadow");
// 		container.classList.remove("bottom-shadow");

// 		if (startTop === endTop && isSame) {
// 			container.classList.add("no-shadow");
// 		} else if (startTop === endTop && !isSame) {
// 			container.classList.add("new-shadow");
// 		} else if (startTop < endTop) {
// 			// show mark above
// 			container.classList.add("top-shadow");
// 		} else {
// 			// show mark below
// 			container.classList.add("bottom-shadow");
// 		}
// 	}, 25);
// 	// }
// }

function endEffectRemoveHighlights(
	workspace: Workspace,
	leafId: string,
	uuid: string,
	backlinkUUID?: string
) {
	const workspaceContainer = workspace.containerEl;
	const span = workspaceContainer.querySelector("." + uuid);

	span?.parentElement
		?.querySelector(".reference-span")
		?.classList.remove("reference-span-selected");
	// firstSpanPart?.classList.remove(uuid);
	span?.classList.remove("reference-data-span-selected");

	if (backlinkUUID) {
		const backlinkSpan = workspaceContainer.querySelector("." + backlinkUUID);

		backlinkSpan?.parentElement
			?.querySelector(".reference-span")
			?.classList.remove("reference-span-selected");
		backlinkSpan?.classList.remove("reference-data-span-selected");
	}

	let targetLeaf = workspace.getLeafById(leafId);
	if (!targetLeaf) {
		// resetCursor();
		throw new Error("Target leaf not found");
	}

	// remove box shadows if any
	let container =
		getContainerElement(targetLeaf)?.querySelector(".view-content");

	if (container) {
		container.classList.remove("no-shadow");
		container.classList.remove("new-shadow");
		container.classList.remove("top-shadow");
		container.classList.remove("bottom-shadow");
	}
}

export async function startBacklinkEffect(span: HTMLSpanElement) {
	let source = getBacklinkHover();
	let updateState = updateBacklinkHover;

	if (!span) return;

	// Toggle hover state
	let uuid = Array.from(span.classList).filter((el) => el.includes("uuid"))[0];
	span.parentElement
		?.querySelector(".reference-span")
		?.classList.add("reference-span-selected");

	span.classList.add("reference-data-span-selected");

	// Mutex, prevent concurrent access to following section of code
	if (source != null && source.uuid == uuid) {
		return;
	} else if (source != null && source.uuid != uuid) {
		// if hovering a new backlink, end the previous and continue
		await endBacklinkHoverEffect();
	}
	updateState({
		type: `${ACTION_TYPE.BACKLINK}-start`,
	});

	updateState({
		uuid,
	});

	const referenceData = span.getAttribute("reference");
	if (!referenceData) throw new Error("Reference data not found");

	const backlink = JSON.parse(referenceData);
	const dataString = backlink.dataString;

	let [prefix, text, suffix, file, from, to] = processURI(dataString);

	// get backlink leaf
	let leavesByTab = collectLeavesByTabHelper();

	let currTabIdx = getCurrentTabIndex(leavesByTab, span);

	let backlinkLeaf = leavesByTab[currTabIdx].filter((leaf: WorkspaceLeaf) => {
		let containerEl = getContainerElement(leaf);
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

		removeHighlight(editorView, from, to);
		highlightSelection(editorView, from, to);

		updateState({
			dataString,
			originalTop: editorView.documentTop,
			backlinkLeafId: backlinkLeafID,
		});
	}

	let referencingFile = backlink.referencingLocation.filename;

	// // Check adjacent tabs for file and open file if needed
	const { newLeaf, temp, originalLeaf } = await openFileInAdjacentTab(
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
		peek: true,
	});

	const originalLeafId = originalLeaf.id;

	const matches = [
		...backlink.referencingLocation.text.matchAll(REFERENCE_REGEX),
	];
	if (matches.length == 0) throw new Error("Matches not found");

	tempDirectionIndicator(
		newLeaf,
		backlink.referencingLocation.text,
		backlink.referencingLocation.prefix + "-",
		"-" + backlink.referencingLocation.suffix,
		matches[0][1],
		id === originalLeafId,
		ACTION_TYPE.BACKLINK
	);

	const cursorViewport = newLeaf.view.editor.getScrollInfo();

	updateState({
		cursorViewport,
	});

	let backlinkSpan: HTMLSpanElement = newLeaf.containerEl.querySelector(
		`span[data="${backlink.dataString}"]`
	);

	if (!backlinkSpan) {
		if (backlink.dataString.slice(-1) == "f") {
			backlinkSpan = newLeaf.containerEl.querySelector(
				`span[data="${backlink.dataString.slice(0, -1)}t"]`
			);
		} else if (backlink.dataString.slice(-1) == "t") {
			backlinkSpan = newLeaf.containerEl.querySelector(
				`span[data="${backlink.dataString.slice(0, -1)}f"]`
			);
		}
	}

	// Can't guarantee that this will be visible.
	if (backlinkSpan) {
		let backlinkUUID = Array.from(backlinkSpan.classList).filter((el) =>
			el.includes("uuid")
		)[0];
		backlinkSpan.parentElement
			?.querySelector(".reference-span")
			?.classList.add("reference-span-selected");

		backlinkSpan.classList.add("reference-data-span-selected");

		updateState({
			backlinkUUID,
		});
	}

	// @ts-ignore
	if (originalLeafId) {
		updateState({
			originalLeafId,
		});
	}

	return;
}

export async function startReferenceEffect(
	span: HTMLSpanElement | null | undefined,
	type: string
) {
	let source = getHover();
	let updateState = updateHover;

	// Mutex, prevent concurrent access to following section of code
	if (source != null) {
		if (source.dataString == span?.getAttribute("data")) return;
		else await endReferenceHoverEffect();
	}

	updateState({
		type: `${type}-start`,
	});

	if (!span) return;

	// color the span
	let uuid = Array.from(span.classList).filter((el) => el.includes("uuid"))[0];
	span.parentElement
		?.querySelector(".reference-span")
		?.classList.add("reference-span-selected");

	span.classList.add("reference-data-span-selected");

	updateState({
		uuid,
	});

	const dataString = span.getAttribute("data");
	if (!dataString) throw new Error("Data string not found");

	let [prefix, text, suffix, file, from, to] = processURI(dataString);

	let leavesByTab = collectLeavesByTabHelper();

	let currTabIdx = getCurrentTabIndex(leavesByTab, span);

	const { newLeaf, temp, originalLeaf } = await openFileInAdjacentTab(
		leavesByTab,
		currTabIdx,
		file,
		type
	);

	// @ts-ignore
	let id = newLeaf.id;
	if (!id) throw new Error("Leaf id not found");
	updateState({
		leafId: id,
		temp,
		peek: true,
	});

	// @ts-ignore
	const originalLeafId = originalLeaf.id;

	if (newLeaf && newLeaf.view instanceof MarkdownView) {
		const editorView: EditorView = getEditorView(newLeaf);
		if (!editorView) throw new Error("Editor view not found");
		const viewport = newLeaf.view.editor.getScrollInfo();

		removeHighlight(editorView, from, to);
		highlightSelection(editorView, from, to);

		tempDirectionIndicator(
			newLeaf,
			text,
			prefix,
			suffix,
			dataString,
			id === originalLeafId
		);

		const cursorViewport = newLeaf.view.editor.getScrollInfo();

		updateState({
			dataString,
			originalTop: editorView.documentTop,
			cursorViewport,
		});
	}

	if (originalLeafId) {
		updateState({
			originalLeafId,
		});
	}
}

export async function endReferenceHoverEffect() {
	if (!getHover() || Object.keys(getHover()).length == 0) {
		// End mutex lock
		resetHover();
		return;
	}

	let { dataString, leafId, originalLeafId, temp, cursorViewport, peek, uuid } =
		getHover();
	resetHover();

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(leafId);
	endEffectRemoveHighlights(workspace, leafId, uuid);

	let editorView = getEditorView(targetLeaf);

	let [prefix, text, suffix, file, from, to] = processURI(dataString);
	removeHighlight(editorView, from, to);
	defaultHighlightSelection(editorView, from, to);

	// let container =
	// 	getContainerElement(targetLeaf).querySelector(".view-content");
	// if (container) {
	// 	container.classList.remove("no-shadow");
	// 	container.classList.remove("new-shadow");
	// 	container.classList.remove("top-shadow");
	// 	container.classList.remove("bottom-shadow");
	// 	container.classList.add("no-shadow");
	// }

	if (cursorViewport && targetLeaf && targetLeaf.view instanceof MarkdownView) {
		const view: MarkdownView = targetLeaf.view;
		view.editor.scrollTo(0, cursorViewport.top);

		let containerEl: HTMLElement = getContainerElement(targetLeaf);
		if (containerEl != null) {
			setTimeout(() => {
				// @ts-ignore
				containerEl.querySelector(".view-content")?.setAttribute("style", "");
			}, 50);
		}
	}

	if (temp && targetLeaf) {
		targetLeaf.detach();

		let originalLeaf = workspace.getLeafById(originalLeafId);
		if (!originalLeaf) throw new Error("Original leaf not found");

		workspace.revealLeaf(originalLeaf);
	}

	if (peek) {
		let originalLeaf = workspace.getLeafById(originalLeafId);
		if (!originalLeaf) {
			resetHover();
			throw new Error("Original leaf not found");
		}

		workspace.revealLeaf(originalLeaf);
	}

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
		backlinkLeafId,
		temp,
		cursorViewport,
		peek,
		uuid,
		backlinkUUID,
	} = getBacklinkHover();
	// resetBacklinkHover();

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(leafId);
	endEffectRemoveHighlights(workspace, leafId, uuid, backlinkUUID);

	if (cursorViewport && targetLeaf && targetLeaf.view instanceof MarkdownView) {
		const view: MarkdownView = targetLeaf.view;
		view.editor.scrollTo(0, cursorViewport.top);
	}

	let containerEl: HTMLElement = getContainerElement(targetLeaf);
	if (containerEl != null) {
		setTimeout(() => {
			// @ts-ignore
			containerEl.querySelector(".view-content")?.setAttribute("style", "");
		}, 50);
	}

	let [prefix, text, suffix, file, from, to] = processURI(dataString);
	// backlink effect
	const originalLeaf = workspace.getLeafById(backlinkLeafId);
	if (!originalLeaf) {
		resetBacklinkHover();
		throw new Error("Original leaf not found");
	}
	let originalEditorView: EditorView = getEditorView(originalLeaf);

	removeHighlight(originalEditorView, from, to);
	defaultHighlightSelection(originalEditorView, from, to);
	// removeHighlights(originalEditorView);

	let container =
		getContainerElement(originalLeaf).querySelector(".view-content");
	if (container) {
		container.classList.remove("no-shadow");
		container.classList.remove("new-shadow");
		container.classList.remove("top-shadow");
		container.classList.remove("bottom-shadow");
		container.classList.add("no-shadow");
	}

	if (temp && targetLeaf) {
		targetLeaf.detach();
	}

	if (peek) {
		let originalLeaf = workspace.getLeafById(originalLeafId);
		if (!originalLeaf) {
			resetBacklinkHover();
			throw new Error("Original leaf not found");
		}

		workspace.revealLeaf(originalLeaf);
	}

	// End mutex lock
	resetBacklinkHover();
}
