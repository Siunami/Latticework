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
import {
	getBacklinkContainer,
	getContainerElement,
	getMarkdownView,
	updateBacklinkMarkPosition,
	updateBacklinkMarkPositions,
} from "./references";

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

function delay(milliseconds: any) {
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
	originalTop?: number
) {
	let positions = findTextPositions(
		leaf.view.data,
		text,
		prefix.slice(0, prefix.length - 1),
		suffix.slice(1, suffix.length)
	);
	if (!positions) throw new Error("Positions not found");
	let rangeStart = positions.rangeStart;
	let rangeEnd = positions.rangeEnd;

	// Oh! I’d compare the bbox of the range
	// (which I know you find in the mark layout routine)
	// to the scrollTop + innerHeight
	const editor = getMarkdownView(leaf).editor;
	const backlinkContainer = getBacklinkContainer(editor);

	const windowHeight = leaf.view.containerEl
		.querySelector(".cm-scroller")
		.getBoundingClientRect().height;
	const scrollTop =
		leaf.view.containerEl.querySelector(".cm-scroller").scrollTop;
	const scrollBottom = scrollTop + windowHeight;

	let visibleElements: string[] = [];
	for (let i = 0; i < backlinkContainer.children.length; i++) {
		let style = backlinkContainer.children[i].getAttribute("style");
		if (style == null) continue;
		let cssProperties = parseCSSString(style);
		let top = parseFloat(cssProperties["top"].replace("px", ""));
		if (top == null) continue;

		if (
			scrollTop <= top &&
			top <= scrollBottom &&
			backlinkContainer.children[i]
		) {
			let reference = backlinkContainer.children[i].getAttribute("reference");
			if (reference) {
				visibleElements.push(JSON.parse(reference).dataString);
			}
		}
	}

	if (!visibleElements.includes(dataString)) {
		let startTop = leaf.view.editor.getScrollInfo().top;
		// let startTop: number;
		// if (originalTop) {
		// 	startTop = originalTop;
		// } else {
		// 	startTop = leaf.view.editor.getScrollInfo().top;
		// 	if (user == ACTION_TYPE.CURSOR) {
		// 		updateCursor({
		// 			originalTop: startTop,
		// 		});
		// 	} else if (user == ACTION_TYPE.MOUSE) {
		// 		updateHover({
		// 			originalTop: startTop,
		// 		});
		// 	}
		// }

		leaf.view.editor.scrollIntoView(
			{
				from: rangeStart,
				to: rangeEnd,
			},
			true
		);
		setTimeout(() => {
			// if (temp) return;
			let endTop = leaf.view.editor.getScrollInfo().top;
			if (startTop < endTop) {
				// show mark above
				// newLeaf.containerEl.querySelector(".view-content").style.boxShadow =
				// 	"inset 0px 0px 10px 10px rgba(248, 255, 255)";
				leaf.containerEl.querySelector(".view-content").style.boxShadow =
					"inset 0px 20px 20px 0px rgba(248, 255, 255)";
			} else {
				// show mark below
				leaf.containerEl.querySelector(".view-content").style.boxShadow =
					"inset 0px -30px 20px 0px rgba(248, 255, 255)";
			}
		}, 10);
	}
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
		highlightSelection(editorView, from, to);
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
			backlinkLeafId: backlinkLeafID,
		});
	}

	let referencingFile = backlink.referencingLocation.filename;

	// if (currTabIdx != -1) {
	// && currTab != -1) {
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

	console.log("span not found");
	tempDirectionIndicator(newLeaf, text, prefix, suffix, dataString);
	// let referencingTFile = getMarkdownView(newLeaf).file;
	// if (!referencingTFile) throw new Error("Referencing TFile not found");
	// let referencingText = await getThat().vault.read(referencingTFile);
	// let positions = findTextPositions(
	// 	referencingText,
	// 	backlink.referencingLocation.text,
	// 	backlink.referencingLocation.prefix,
	// 	backlink.referencingLocation.suffix
	// );
	// console.log(positions);
	// if (!positions) throw new Error("Positions not found");
	// let rangeStart = positions.rangeStart;
	// let rangeEnd = positions.rangeEnd;

	// newLeaf.view.editor.scrollIntoView(
	// 	{
	// 		from: rangeStart,
	// 		to: rangeEnd,
	// 	},
	// 	true
	// );

	const cursorViewport = newLeaf.view.editor.getScrollInfo();

	updateState({
		cursorViewport,
	});

	// NEED TO GET TO SPAN BEFORE TRYING TO SELECT IT
	// IT COULD NOT EXIST.

	let backlinkSpan: HTMLSpanElement = newLeaf.containerEl.querySelector(
		`span[data="${backlink.dataString}"]`
	);
	console.log(backlinkSpan);

	// Can't guarantee that this will be visible.
	if (backlinkSpan) {
		const editor = getMarkdownView(newLeaf).editor;
		const backlinkContainer = getBacklinkContainer(editor);

		// const windowHeight = newLeaf.view.containerEl
		// 	.querySelector(".cm-scroller")
		// 	.getBoundingClientRect().height;
		// const scrollTop =
		// 	newLeaf.view.containerEl.querySelector(".cm-scroller").scrollTop;
		// const scrollBottom = scrollTop + windowHeight;
		// // console.log("top: " + backlinkSpan.getBoundingClientRect().top);
		// // console.log("scrollTop: " + scrollTop);
		// // console.log("scrollBottom: " + scrollBottom);

		// const spanTop = backlinkSpan.getBoundingClientRect().top - 88;

		// // console.log(spanTop);
		// // console.log(windowHeight);
		// if (spanTop < 0) {
		// 	editor.scrollTo(0, scrollTop - (windowHeight / 2 - spanTop));
		// } else if (spanTop > windowHeight) {
		// 	editor.scrollTo(0, scrollBottom - (windowHeight / 2 - spanTop));
		// }

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
	} else {
	}

	const originalLeafId = originalLeaf.id;

	if (
		id != originalLeafId &&
		(newLeaf.containerEl.querySelector(".view-content").style.boxShadow ==
			"none" ||
			newLeaf.containerEl.querySelector(".view-content").style.boxShadow == "")
	) {
		newLeaf.containerEl.querySelector(".view-content").style.boxShadow =
			"inset 0px 0px 10px 10px rgba(248, 255, 255)";
	}

	// @ts-ignore
	if (originalLeafId) {
		updateState({
			originalLeafId,
		});
	}

	// console.log(span);
	// const portal = span.querySelector(".portal");
	// if (portal) span.style.backgroundColor = SVG_HOVER_COLOR;

	return;
}

export async function startReferenceEffect(
	span: HTMLSpanElement,
	type: string
) {
	let source = type == ACTION_TYPE.MOUSE ? getHover() : getCursor();
	let destination = type == ACTION_TYPE.MOUSE ? getCursor() : getHover();
	let updateState = type == ACTION_TYPE.MOUSE ? updateHover : updateCursor;

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
	const { newLeaf, temp, originalLeaf } = await openFileInAdjacentTab(
		leavesByTab,
		currTabIdx,
		file,
		type
	);
	// if (!newLeaf) {
	// 	resetState();
	// 	return;
	// }
	await delay(100); // ensure new leaf has opened completely before doing checks below

	// @ts-ignore
	let id = newLeaf.id;
	if (!id) throw new Error("Leaf id not found");
	updateState({
		leafId: id,
		temp,
		peek: true,
	});

	if (newLeaf && newLeaf.view instanceof MarkdownView) {
		const editorView: EditorView = getEditorView(newLeaf);
		if (!editorView) throw new Error("Editor view not found");
		const viewport = newLeaf.view.editor.getScrollInfo();

		highlightSelection(editorView, from, to);

		tempDirectionIndicator(newLeaf, text, prefix, suffix, dataString);

		const cursorViewport = newLeaf.view.editor.getScrollInfo();

		updateState({
			dataString,
			originalTop: editorView.documentTop,
			// originalLeafId: currLeafID,
			cursorViewport,
		});
	}

	const originalLeafId = originalLeaf.id;

	if (
		id != originalLeafId &&
		(newLeaf.containerEl.querySelector(".view-content").style.boxShadow ==
			"none" ||
			newLeaf.containerEl.querySelector(".view-content").style.boxShadow == "")
	) {
		newLeaf.containerEl.querySelector(".view-content").style.boxShadow =
			"inset 0px 0px 10px 10px rgba(248, 255, 255)";
	}

	if (originalLeafId) {
		updateState({
			originalLeafId,
		});
	}
}

export async function endReferenceCursorEffect() {
	if (!getCursor() || Object.keys(getCursor()).length == 0) {
		// End mutex lock
		resetCursor();
		return;
	}

	const { dataString, leafId, originalLeafId, temp, cursorViewport, peek } =
		getCursor();
	if (getHover() != null && getHover().dataString == dataString) {
		// End mutex lock
		resetCursor();
		return;
	}

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(leafId);
	if (!targetLeaf) {
		resetHover();
		throw new Error("Target leaf not found");
	}

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
			workspace.revealLeaf(cursorLeaf);
			const editorView: EditorView = getEditorView(cursorLeaf);
			highlightSelection(editorView, from, to);
			// tempDirectionIndicator(
			// 	cursorLeaf,
			// 	text,
			// 	prefix,
			// 	suffix,
			// 	temp,
			// 	dataString,
			// 	ACTION_TYPE.MOUSE
			// );
		} else {
			let containerEl: HTMLElement = getContainerElement(targetLeaf);
			if (containerEl != null) {
				// @ts-ignore
				containerEl.querySelector(".view-content")?.setAttribute("style", "");
			}
		}
	}

	if (temp && targetLeaf) {
		targetLeaf.detach();
	}

	if (peek) {
		let originalLeaf = workspace.getLeafById(originalLeafId);
		if (!originalLeaf) throw new Error("Original leaf not found");

		workspace.revealLeaf(originalLeaf);
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

	const { dataString, leafId, originalLeafId, temp, cursorViewport, peek } =
		getHover();
	if (getCursor() != null && getCursor().dataString == dataString) {
		console.log("cursor reset");
		// End mutex lock
		resetHover();
		return;
	}

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(leafId);
	if (!targetLeaf) {
		resetHover();
		throw new Error("Target leaf not found");
	}

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
			if (!editorView) throw new Error("Editor view not found");

			highlightSelection(editorView, from, to);
			// tempDirectionIndicator(
			// 	cursorLeaf,
			// 	text,
			// 	prefix,
			// 	suffix,
			// 	temp,
			// 	dataString
			// );
		} else {
			let containerEl: HTMLElement = getContainerElement(targetLeaf);
			if (containerEl != null) {
				// @ts-ignore
				containerEl.querySelector(".view-content")?.setAttribute("style", "");
			}
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
		backlinkLeafId,
		temp,
		cursorViewport,
		originalTab,
		peek,
	} = getBacklinkHover();
	if (getCursor() != null && getCursor().dataString == dataString) {
		// End mutex lock
		resetBacklinkHover();
		return;
	}

	const { workspace } = getThat();
	let targetLeaf = workspace.getLeafById(leafId);
	if (!targetLeaf) {
		resetBacklinkHover();
		throw new Error("Target leaf not found");
	}

	if (cursorViewport && targetLeaf && targetLeaf.view instanceof MarkdownView) {
		const view: MarkdownView = targetLeaf.view;
		view.editor.scrollTo(0, cursorViewport.top);
	}

	let containerEl: HTMLElement = getContainerElement(targetLeaf);
	if (containerEl != null) {
		// @ts-ignore
		containerEl.querySelector(".view-content")?.setAttribute("style", "");
	}

	let editorView: EditorView = getEditorView(targetLeaf);

	removeHighlights(editorView);

	// backlink effect
	const originalLeaf = workspace.getLeafById(backlinkLeafId);
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

	if (peek) {
		let originalLeaf = workspace.getLeafById(originalLeafId);
		if (!originalLeaf) {
			resetBacklinkHover();
			throw new Error("Original leaf not found");
		}

		workspace.revealLeaf(originalLeaf);
	}

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
