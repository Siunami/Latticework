import { Editor, TFile, WorkspaceLeaf, MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { v5 as uuidv5 } from "uuid";

import {
	updateHover,
	getThat,
	getBacklinks,
	getHover,
	updateBacklinkHover,
	getBacklinkHover,
	updateBacklinks,
} from "./state";
import {
	processURI,
	getPrefixAndSuffix,
	encodeURIComponentString,
	decodeURIComponentString,
} from "./utils";
import { REFERENCE_REGEX } from "./constants";
import { DocumentLocation, Backlink } from "./types";
import { v4 as uuidv4 } from "uuid";
import {
	defaultHighlightSelection,
	getHighlights,
	removeHighlight,
} from "./mark";
import { getEditorView } from "./effects";

/**
 * Generate the default highlights for the backlinks that are rendered on the page
 * @param leaf
 */
export function generateDefaultHighlights(leaf: WorkspaceLeaf) {
	const editor = getMarkdownView(leaf).editor;
	const backlinkContainer = getBacklinkContainer(editor);
	// let editorView = getCodeMirrorEditorView(editor);

	let activeHighlight;
	for (let i = 0; i < backlinkContainer.children.length; i++) {
		if (backlinkContainer.children.item(i)) {
			// @ts-ignore
			let backlinkItem = backlinkContainer.children.item(i);
			if (!backlinkItem) return;
			if (backlinkItem.classList.contains("reference-data-span-selected")) {
				let reference = backlinkItem.getAttribute("reference");
				let referenceData = JSON.parse(reference!);
				activeHighlight = referenceData.dataString;
			}
		}
	}

	// reference-data-span-selected
	let backlinks = [];
	for (let i = 0; i < backlinkContainer.children.length; i++) {
		if (backlinkContainer.children.item(i)) {
			// @ts-ignore
			let backlinkItem = backlinkContainer.children.item(i);
			if (!backlinkItem) return;
			let reference = backlinkItem.getAttribute("reference");
			let referenceData = JSON.parse(reference!);
			if (referenceData.dataString != activeHighlight) {
				backlinks.push(backlinkContainer.children.item(i) as HTMLElement);
			}
		}
	}

	const originalLeafMarkdownView: MarkdownView = leaf.view as MarkdownView;

	for (let backlink of backlinks) {
		let reference = backlink.getAttribute("reference")
			? JSON.parse(backlink.getAttribute("reference")!)
			: null;
		let [prefix, text, suffix, file, from, to] = processURI(
			reference.dataString
		);
		if (reference) {
			// this is where I'd want to do a better hypothesis highlight
			let referenceFrom = reference.referencedLocation.from;
			let referenceTo = reference.referencedLocation.to;

			const index =
				originalLeafMarkdownView.data.indexOf(
					prefix.slice(0, -1) + text + suffix.slice(1, suffix.length)
				) + prefix.slice(0, -1).length;

			let editorView: EditorView | null = getEditorView(leaf);
			if (!editorView) return;

			console.log("generate default highlights");

			// console.log(getHighlights(editorView));
			// removeHighlight(editorView, index, index + (referenceTo - referenceFrom));
			// removeHighlight(editorView, referenceFrom, referenceTo);
			// defaultHighlightSelection(originalEditorView, index, index + (to - from));

			defaultHighlightSelection(
				editorView,
				index,
				index + (referenceTo - referenceFrom)
			);
		}
	}
}

export function createReferenceIcon(
	portalText: string | null = null
): HTMLSpanElement {
	const span = document.createElement("span");
	span.style.cursor = "pointer";
	span.classList.add("reference-data-span");
	span.classList.add("uuid-" + uuidv4());

	if (portalText == null) {
		return span;
	}

	if (portalText != "inline reference widget |*|") {
		let portal = document.createElement("div");
		portal.classList.add("portal");

		portalText.split(":").forEach((text, index) => {
			if (index === 0 || index === 2)
				portal.innerHTML += decodeURIComponentString(text);
			else if (index === 1) {
				portal.innerHTML += `<span class="text-accent";>${text}</span>`;
			}
		});

		portal.style.userSelect = "none";
		portal.style.pointerEvents = "none";
		span.appendChild(portal);
	}

	return span;
}

export function createBacklinkIcon(portalText: string | null = null) {
	const span = document.createElement("span");
	span.style.cursor = "pointer";
	span.classList.add("backlink-span");
	span.classList.add("uuid-" + uuidv4());

	const textAccent = document.createElement("span");
	textAccent.classList.add("text-accent");
	textAccent.innerHTML = "↗";
	span.appendChild(textAccent);

	if (portalText != null) {
		textAccent.style.display = "none";

		let portal = document.createElement("div");
		portal.classList.add("portal");

		console.log("portal text", portalText);

		portalText.split(":").forEach((text, index) => {
			if (index === 0 || index === 2)
				portal.innerHTML += decodeURIComponentString(text);
			else if (index === 1) {
				portal.innerHTML += `<span class="text-accent";>${text}</span>`;
			}
		});

		portal.style.userSelect = "none";
		portal.style.pointerEvents = "none";
		span.appendChild(portal);
	}

	return { span, textAccent };
}

export function getCodeMirrorEditorView(editor: Editor): EditorView {
	// @ts-ignore this type is missing... but the Obsidian docs tell us to do it this way??
	return editor.cm as EditorView;
}

export function getContainerElement(
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

export function getBacklinkContainer(editor: Editor): HTMLElement {
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

export function getLeafLineBBox(leaf: WorkspaceLeaf) {
	const line = getContainerElement(leaf).querySelector(".cm-line");
	if (!line) {
		throw new Error("Document has no lines");
	}
	return line.getBoundingClientRect();
}

export function createBacklinkMark(backlink: Backlink): HTMLElement {
	let { span, textAccent } = createBacklinkIcon(backlink.portalText);
	span.classList.add("backlink-data-span");

	const portal: HTMLElement | null = span.querySelector(".portal");

	span.style.position = "absolute";

	span.id = getBacklinkID(backlink);
	span.setAttribute("reference", JSON.stringify(backlink));

	const resizeObserver = new ResizeObserver((entries) => {
		if (portal && portal.style.display != "none") {
			textAccent.style.display = "none";
		} else {
			textAccent.style.display = "inline";
		}
	});

	// Start observing an element
	resizeObserver.observe(span);

	span.addEventListener("click", openBacklinkReference);

	return span;
}

/**
 * Layout the backlinks on the page without overlapping
 * @param leaf
 * @param backlinksToLeaf all backlinks that are referencing the leaf
 * @param showPortals whether the portals should be shown or not
 */
const BACKLINK_LEFT_MARGIN = 42;

export function layoutBacklinks(
	leaf: WorkspaceLeaf,
	backlinksToLeaf: Backlink[],
	showPortals: boolean
) {
	const editor = getMarkdownView(leaf).editor;
	const backlinkContainer = getBacklinkContainer(editor);

	// Get all existing backlinks
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

	const lineBbox = getLeafLineBBox(leaf);

	// Create the initial backlink mark if necessary and position it in the correct vertical position
	let referenceMarkers = backlinksToLeaf.map((backlink) => {
		const { from } = backlink.referencedLocation;

		const editorView = getCodeMirrorEditorView(editor);
		const bbox = editorView.coordsAtPos(from);
		if (!bbox) return;

		let referenceMarker = backlinkContainer.querySelector(
			`#${getBacklinkID(backlink)}`
		) as HTMLElement | null;

		if (referenceMarker === null) {
			referenceMarker = createBacklinkMark(backlink);
			backlinkContainer.appendChild(referenceMarker);
		}

		if (bbox) {
			referenceMarker.style.position = "absolute";

			const scrollerBbox = editorView.scrollDOM.getBoundingClientRect(); // the view window
			const absoluteY =
				bbox.top - scrollerBbox.top + editorView.scrollDOM.scrollTop;
			referenceMarker.setAttribute("top", absoluteY.toString());
			referenceMarker.style.top = absoluteY + "px";
			referenceMarker.style.left = lineBbox.width + BACKLINK_LEFT_MARGIN + "px";
		}

		return referenceMarker;
	});

	// Now account for possible position overlaps and shift downwards
	// also consider whether the portals should be shown or not.
	let lastYBottom = -Infinity; // for large documents 😁

	referenceMarkers
		.sort(
			(a, b) =>
				parseInt(a!.getAttribute("top")!) - parseInt(b!.getAttribute("top")!)
		)
		.forEach((marker) => {
			if (!marker) return;
			// toggle portals
			const portal: HTMLElement | null = marker.querySelector(".portal");

			marker.classList.add("backlink-span");
			if (showPortals && portal) {
				portal.style.display = "inline";
			} else if (portal) {
				portal.style.display = "none";
			}

			// if (showPortals) {
			// 	if (portal) {
			// 		portal.style.display = "inline";
			// 		marker.classList.add("backlink-span");
			// 	}
			// } else {
			// 	if (portal) {
			// 		portal.style.display = "none";
			// 	}
			// 	marker.classList.remove("backlink-span");
			// }

			// get positioning
			let top = parseInt(marker!.getAttribute("top")!);
			top = Math.max(top, lastYBottom);
			lastYBottom = top + marker.getBoundingClientRect().height;
			// marker.setAttribute("top", top.toString());
			marker.style.top = top + "px";
			marker.style.left = lineBbox.width + BACKLINK_LEFT_MARGIN + "px";
		});
}

let debounceTimer: NodeJS.Timeout;

export function updateBacklinkMarkPositions(
	leaves = getThat().workspace.getLeavesOfType("markdown") as WorkspaceLeaf[]
) {
	clearTimeout(debounceTimer);

	return new Promise((resolve) => {
		debounceTimer = setTimeout(async () => {
			let allBacklinks: Backlink[] = getBacklinks();

			const promises = leaves.map(async (leaf) => {
				let file = getMarkdownView(leaf)?.file;
				if (file) {
					const backlinksToLeaf = allBacklinks.filter(
						// @ts-ignore
						(b) => b.referencedLocation.filename == file.path
					);
					const showPortals = getContainerElement(leaf).innerWidth > 900;
					layoutBacklinks(leaf, backlinksToLeaf, showPortals);
				}
			});

			await Promise.all(promises);
			resolve(debounceTimer);
		}, 100);
	});
}

// Keep track of the existing observer and listener
let existingObserver: ResizeObserver | null = null;

export async function addReferencesToLeaf(leaf: WorkspaceLeaf) {
	await updateBacklinkMarkPositions([leaf]);
	generateDefaultHighlights(leaf);

	// Remove the existing observer before creating a new one
	if (existingObserver) {
		existingObserver.disconnect();
	}

	const newObserver = new ResizeObserver(async () => {
		console.log("resize observer");
		await updateBacklinkMarkPositions();
	});

	const markdownView = getMarkdownView(leaf);
	let workspaceTabs = markdownView.containerEl.closest(".workspace-tabs");
	if (!workspaceTabs) {
		throw new Error("Missing workspace tabs");
	}

	newObserver.observe(workspaceTabs);

	// Update the existing observer
	existingObserver = newObserver;

	return leaf;
}

export function getMarkdownView(leaf: WorkspaceLeaf): MarkdownView {
	if (!(leaf.view instanceof MarkdownView)) {
		throw new Error("Unexpected non-markdown view");
	}
	return leaf.view as MarkdownView;
}

export function getFilename(leaf: WorkspaceLeaf): string {
	const { file } = getMarkdownView(leaf);
	if (!file) {
		throw new Error("Unexpected missing file");
	}
	return file.name;
}

// get all the text from the start of the line to the end of the line
const getLineText = (text: string, index: number): string => {
	const startOfLine = text.lastIndexOf("\n", index - 1) + 1;
	const endOfLine = text.indexOf("\n", index);
	return text.slice(startOfLine, endOfLine !== -1 ? endOfLine : undefined);
};

function findMatchPositions(line: string, regex: RegExp) {
	let match;
	const positions = [];
	while ((match = regex.exec(line)) !== null) {
		positions.push({
			match: match[0],
			start: match.index,
			end: match.index + match[0].length,
		});
	}
	return positions;
}

export function createBacklinkData(
	referencingFileData: string,
	referencingFile: TFile
): Backlink[] {
	let backlinks: Backlink[] = [];
	let indexes: number[] = [];

	let matches = [...referencingFileData.matchAll(REFERENCE_REGEX)];
	matches.forEach((match) => {
		if (match[1].split(":").length != 8) return;
		let [prefix, text, suffix, filename, from, to, portal, toggle] = processURI(
			match[1]
		);

		const referencedLocation: DocumentLocation = {
			prefix,
			text,
			suffix,
			filename,
			from,
			to,
			portal,
			toggle,
		};

		let index = match.index;
		if (!index) return;

		const referencingSurroundingStrings = getPrefixAndSuffix(
			referencingFileData,
			index,
			index + match[0].length
		);

		const referencingLocation: DocumentLocation = {
			prefix: referencingSurroundingStrings.prefix,
			text: referencingFileData.slice(index, index + match[0].length),
			suffix: referencingSurroundingStrings.suffix,
			filename: referencingFile.path,
			from: match.index!, // TODO do weird string format
			to: match.index! + match[0].length, // TODO do weird string format
			portal,
			toggle,
		};

		if (portal == "portal") {
			// OR no-portal

			let line = getLineText(referencingFileData, index);
			let matchPositions = findMatchPositions(
				line,
				new RegExp(REFERENCE_REGEX)
			);

			let matchIndex = 0;
			for (let i = 0; i < matchPositions.length; i++) {
				if (matchPositions[i].match == match[0]) {
					break;
				} else {
					matchIndex += matchPositions[i].end - matchPositions[i].start - 1; // -1 because the line is replaced by a single character
				}
			}

			const portalReferenceRepresentation = "↗";
			let portalText = line.replace(
				new RegExp(REFERENCE_REGEX, "g"),
				portalReferenceRepresentation
			);

			let portalTextIndex = line.indexOf(match[0]) - matchIndex;

			const PORTAL_CONTEXT_LIMIT = 120;

			// getting the portal text selection around the reference
			let startPortalText = portalText.substring(
				Math.max(portalTextIndex - PORTAL_CONTEXT_LIMIT, 0),
				portalTextIndex
			);

			if (
				startPortalText.length > 0 &&
				portalTextIndex - PORTAL_CONTEXT_LIMIT >= 0
			)
				startPortalText = "…" + startPortalText;

			let endPortalText = portalText.substring(
				portalTextIndex + 1,
				Math.min(portalTextIndex + PORTAL_CONTEXT_LIMIT, portalText.length)
			);

			if (
				endPortalText.length > 0 &&
				portalTextIndex + PORTAL_CONTEXT_LIMIT < portalText.length
			)
				endPortalText = endPortalText + "…";

			backlinks.push({
				referencedLocation,
				referencingLocation,
				dataString: match[1],
				portalText:
					encodeURIComponentString(startPortalText) +
					":" +
					portalReferenceRepresentation +
					":" +
					encodeURIComponentString(endPortalText),
			});
		} else {
			backlinks.push({
				referencedLocation,
				referencingLocation,
				dataString: match[1],
			});
		}
	});
	return backlinks;
}

/**
 *
 * @returns a list of all backlinks in the vault
 */
export async function generateBacklinks(): Promise<Backlink[]> {
	let backlinks: Backlink[] = [];
	let markdownFiles = await this.app.vault.getMarkdownFiles();

	await Promise.all(
		markdownFiles.map((file: TFile) => this.app.vault.read(file))
	).then((files: string[]) => {
		const zippedArray = markdownFiles.map((file: TFile, index: number) => ({
			markdownFile: file,
			fileData: files[index],
		}));

		zippedArray.forEach((file: { markdownFile: TFile; fileData: string }) => {
			let fileBacklinks = createBacklinkData(file.fileData, file.markdownFile);
			updateBacklinks(fileBacklinks);

			backlinks.push(...fileBacklinks);
		});
	});
	return backlinks;
}

export async function openBacklinkReference(ev: MouseEvent) {
	let hover = getBacklinkHover();
	if (!hover) return;
	let leaf = getThat().workspace.getLeafById(hover.leafId);

	// @ts-ignore
	let container = leaf.containerEl;
	if (!container) throw new Error("Container not found");
	container.querySelector(".view-content").style.boxShadow = "none";

	updateBacklinkHover({
		temp: false,
		cursorViewport: null,
		peek: false,
	});
}

export async function openReference(ev: MouseEvent) {
	let hover = getHover();
	if (!hover) return;
	let leaf = getThat().workspace.getLeafById(hover.leafId);

	// @ts-ignore
	let container = leaf.containerEl;
	if (!container) throw new Error("Container not found");
	container.querySelector(".view-content").style.boxShadow = "none";

	updateHover({
		temp: false,
		cursorViewport: null,
		peek: false,
	});
}
