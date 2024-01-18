import { Editor, TFile, WorkspaceLeaf, MarkdownView } from "obsidian";
import { EditorView, scrollPastEnd } from "@codemirror/view";
import { v5 as uuidv5 } from "uuid";

import {
	state,
	updateHover,
	getThat,
	getBacklinks,
	updateBacklinks,
	updateCursor,
	getCursor,
	getHover,
	resetCursor,
	updateHoveredCursor,
	updateBacklinkHover,
	getBacklinkHover,
} from "./state";
import {
	processURI,
	getPrefixAndSuffix,
	handleRemoveHoveredCursor,
	encodeURIComponentString,
	decodeURIComponentString,
} from "./utils";
import {
	ACTION_TYPE,
	PORTAL_TEXT_SLICE_SIZE,
	REFERENCE_ICON_HEIGHT,
	REFERENCE_REGEX,
	SVG_HOVER_COLOR,
} from "./constants";
import { DocumentLocation, Backlink } from "./types";
import { v4 as uuidv4 } from "uuid";
import { defaultHighlightSelection } from "./mark";
import { delay } from "./effects";
import { generateDefaultHighlights } from "./main";

export function createReferenceIcon(portalText: string | null = null): {
	span: HTMLSpanElement;
	svg: SVGElement;
} {
	const span = document.createElement("span");
	span.style.cursor = "pointer";
	span.classList.add("reference-data-span");
	span.classList.add("uuid-" + uuidv4());

	const height = REFERENCE_ICON_HEIGHT;
	const width = height * 0.9;

	if (portalText == null) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		// svg.setAttribute("width", `${width}`);
		// svg.setAttribute("height", `${height}`);
		// svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
		// svg.setAttribute("fill", "white");
		// svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		// svg.style.border = "3px solid grey";
		// svg.style.backgroundColor = "white";
		// svg.style.borderRadius = "3px";
		// svg.style.cursor = "pointer";
		// svg.classList.add("reference-icon");

		// const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
		// line.setAttribute("x1", "3");
		// line.setAttribute("y1", `${(height - 3) / 3}`);
		// line.setAttribute("x2", "12");
		// line.setAttribute("y2", `${(height - 3) / 3}`);
		// line.setAttribute("stroke-width", "2"); // Set the stroke weight to 1
		// line.setAttribute("stroke", "grey"); // Set the stroke color to black

		// svg.appendChild(line);

		// const line2 = document.createElementNS(
		// 	"http://www.w3.org/2000/svg",
		// 	"line"
		// );
		// line2.setAttribute("x1", "3");
		// line2.setAttribute("y1", `${((height - 3) / 3) * 2}`);
		// line2.setAttribute("x2", "15");
		// line2.setAttribute("y2", `${((height - 3) / 3) * 2}`);
		// line2.setAttribute("stroke-width", "2"); // Set the stroke weight to 1
		// line2.setAttribute("stroke", "grey"); // Set the stroke color to black

		// svg.appendChild(line2);

		// const line3 = document.createElementNS(
		// 	"http://www.w3.org/2000/svg",
		// 	"line"
		// );
		// line3.setAttribute("x1", "3");
		// line3.setAttribute("y1", `${((height - 3) / 3) * 3}`);
		// line3.setAttribute("x2", "10");
		// line3.setAttribute("y2", `${((height - 3) / 3) * 3}`);
		// line3.setAttribute("stroke-width", "2"); // Set the stroke weight to 1
		// line3.setAttribute("stroke", "grey"); // Set the stroke color to black

		// svg.appendChild(line3);

		// span.appendChild(svg);
		return { span: span, svg };
	}

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	// svg.setAttribute("width", `${width}`);
	// svg.setAttribute("height", `${height}`);
	// svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	// svg.setAttribute("fill", "white");
	// svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	// // svg.style.backgroundColor = "white";
	// svg.classList.add("portal-icon");

	// // <path d="M4 6H13M4 10H14M3.99643 1.00037C7.0853 0.999923 11.1618 0.999881 14.0043 1.00025C15.6603 1.00046 17 2.34315 17 3.99923V11.3601C17 12.9951 15.6909 14.3276 14.0563 14.3582L7.34301 14.4842C6.79168 14.4945 6.25387 14.6566 5.78866 14.9527L2.53688 17.022C1.87115 17.4456 1 16.9674 1 16.1783V3.99993C1 2.34351 2.34001 1.0006 3.99643 1.00037Z" stroke="black" stroke-width="2"/>
	// const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	// path.setAttribute(
	// 	"d",
	// 	"M4 6H13M4 10H14M3.99643 1.00037C7.0853 0.999923 11.1618 0.999881 14.0043 1.00025C15.6603 1.00046 17 2.34315 17 3.99923V11.3601C17 12.9951 15.6909 14.3276 14.0563 14.3582L7.34301 14.4842C6.79168 14.4945 6.25387 14.6566 5.78866 14.9527L2.53688 17.022C1.87115 17.4456 1 16.9674 1 16.1783V3.99993C1 2.34351 2.34001 1.0006 3.99643 1.00037Z"
	// );
	// path.setAttribute("stroke", "gray");
	// path.setAttribute("stroke-width", "2");

	// span.style.backgroundColor = "";

	// svg.appendChild(path);

	// span.appendChild(svg);

	if (portalText != "inline reference widget |*|") {
		let portal = document.createElement("div");
		// portal.style.color = "black";
		portal.classList.add("portal");

		portalText.split(":").forEach((text, index) => {
			if (index === 0 || index === 2)
				portal.innerHTML += decodeURIComponentString(text);
			else if (index === 1) {
				portal.innerHTML += `<span class="text-accent";>${text}</span>`;
			}
		});

		// span.style.backgroundColor = "white";
		portal.style.userSelect = "none";
		portal.style.pointerEvents = "none";
		span.appendChild(portal);
	}

	return { span: span, svg };

	// let newSpan: HTMLSpanElement = document.createElement("span");
	// newSpan.innerHTML = "📄";
	// newSpan.style.cursor = "pointer";
}

export function updateHoveredCursorColor(span: HTMLSpanElement, user: string) {
	// remove existing cursors
	const svg = span.querySelector("svg");
	const portal: HTMLElement | null = span.querySelector(".portal");

	if (span && svg && !portal) {
		handleRemoveHoveredCursor(user); // remove any existing hovered reference icon
		if (svg.classList.contains("reference-icon"))
			svg.style.backgroundColor = SVG_HOVER_COLOR;
		else {
			// svg.setAttribute("fill", SVG_HOVER_COLOR);
			span = span.querySelector("span") as HTMLSpanElement;
			span.style.backgroundColor = SVG_HOVER_COLOR;
		}

		updateHoveredCursor(svg, user); // add the currently hovered reference icon
	}
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

export function getLeafBBoxElements(leaf: WorkspaceLeaf) {
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

	return { titleBbox, lineBbox };
}

export function updateBacklinkMarkPosition(
	leaf: WorkspaceLeaf,
	backlinksToLeaf: Backlink[],
	showPortals: boolean
) {
	const editor = getMarkdownView(leaf).editor;
	const backlinkContainer = getBacklinkContainer(editor);

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

	const { titleBbox, lineBbox } = getLeafBBoxElements(leaf);

	// Create the initial backlink mark if necessary and position it in the correct vertical position
	let referenceMarkers = backlinksToLeaf.map((backlink) => {
		const { from } = backlink.referencedLocation;

		const bbox = getCodeMirrorEditorView(editor).coordsAtPos(from);
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

			referenceMarker.setAttribute("top", bbox.top.toString());
			referenceMarker.style.top = bbox.top - titleBbox.top + 32 + "px";
			referenceMarker.style.left = lineBbox.width + 40 + "px";
		}

		return referenceMarker;
	});

	// Now account for possible position overlaps and shift downwards
	// also consider whether the portals should be shown or not.
	let lastYBottom = -Infinity; // for large documents 😁
	let margin = 4;
	referenceMarkers
		.sort(
			(a, b) =>
				parseInt(a!.getAttribute("top")!) - parseInt(b!.getAttribute("top")!)
		)
		.forEach((marker) => {
			if (!marker) return;
			// toggle portals
			const portal: HTMLElement | null = marker.querySelector(".portal");

			if (showPortals) {
				// if (svg && !portal) svg.style.display = "inline";
				// else if (svg) svg.style.display = "none";

				if (portal) {
					portal.style.display = "inline";
					marker.classList.add("backlink-span");
				}
			} else {
				// if (svg) svg.style.display = "inline";
				if (portal) {
					portal.style.display = "none";
				}
				marker.classList.remove("backlink-span");
			}
			// get positioning
			let top = parseInt(marker!.getAttribute("top")!);
			top = Math.max(top, lastYBottom + margin);
			lastYBottom = top + marker.getBoundingClientRect().height + margin;
			marker.setAttribute("top", top.toString());
			marker.style.top = top - titleBbox.top + 32 + "px";
			marker.style.left = lineBbox.width + 40 + "px";
		});
}

let debounceTimer: NodeJS.Timeout;

export async function updateBacklinkMarkPositions() {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(async () => {
		const leaves = getThat().workspace.getLeavesOfType(
			"markdown"
		) as WorkspaceLeaf[];

		setTimeout(async () => {
			const allBacklinks: Backlink[] = await recomputeReferencesForPage();

			leaves.map(async (leaf) => {
				const backlinksToLeaf = allBacklinks.filter(
					// @ts-ignore
					(b) => b.referencedLocation.filename == leaf.view.file.path
				);
				// width 900, show the reference
				const showPortals = getContainerElement(leaf).innerWidth > 900;
				updateBacklinkMarkPosition(leaf, backlinksToLeaf, showPortals);
			});
			await Promise.all(
				leaves.map(async (leaf) => {
					const backlinksToLeaf = allBacklinks.filter(
						// @ts-ignore
						(b) => b.referencedLocation.filename == leaf.view.file.path
					);
					// width 900, show the reference
					const showPortals = getContainerElement(leaf).innerWidth > 900;
					updateBacklinkMarkPosition(leaf, backlinksToLeaf, showPortals);
				})
			);
		}, 500);
	}, 100);
}

export function createBacklinkMark(backlink: Backlink): HTMLElement {
	let { span, svg } = createReferenceIcon(backlink.portalText);
	span.classList.add("backlink-data-span");

	const portal: HTMLElement | null = span.querySelector(".portal");

	span.style.position = "absolute";

	span.id = getBacklinkID(backlink);
	span.setAttribute("reference", JSON.stringify(backlink));

	const resizeObserver = new ResizeObserver((entries) => {
		if (portal && portal.style.display != "none") {
			// span.style.backgroundColor = "white";
			span.classList.add("backlink-portal-open");
		} else {
			// span.style.backgroundColor = "";
			span.classList.remove("backlink-portal-open");
		}
	});

	// Start observing an element
	resizeObserver.observe(span);

	span.addEventListener("click", openBacklinkReference);

	return span;
}

export async function addReferencesToLeaf(leaf: WorkspaceLeaf) {
	const markdownView = getMarkdownView(leaf);
	let workspaceTabs = markdownView.containerEl.closest(".workspace-tabs");
	if (!workspaceTabs) {
		throw new Error("Missing workspace tabs");
	}

	await updateBacklinkMarkPositions();
	await delay(2000);
	generateDefaultHighlights(leaf);

	getContainerElement(markdownView.editor)
		.querySelector(".cm-scroller")!
		.addEventListener("scroll", async () => {
			await updateBacklinkMarkPositions();
			await delay(2000);
			generateDefaultHighlights(leaf);
		});

	let resizeObserver = new ResizeObserver(async () => {
		await updateBacklinkMarkPositions();
		await delay(2000);
		generateDefaultHighlights(leaf);
	});

	resizeObserver.observe(workspaceTabs);

	return leaf;
}

export function getMarkdownView(leaf: WorkspaceLeaf): MarkdownView {
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

function createBacklinkData(
	referencingFileData: string,
	referencingFile: TFile
): Backlink[] {
	let backlinks: Backlink[] = [];

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

		let index = referencingFileData.indexOf(match[0]);

		const referencingSurroundingStrings = getPrefixAndSuffix(
			referencingFileData,
			index,
			index + match[0].length
		);

		const referencingLocation: DocumentLocation = {
			// prefix: referencingFileData.slice(index - 25, index),
			prefix: referencingSurroundingStrings.prefix,
			text: referencingFileData.slice(index, index + match[0].length),
			// suffix: referencingFileData.slice(
			// 	index + match[0].length,
			// 	index + match[0].length + 25
			// ),
			suffix: referencingSurroundingStrings.suffix,
			filename: referencingFile.path,
			from: match.index!, // TODO do weird string format
			to: match.index! + match[0].length, // TODO do weird string format
			portal,
			toggle,
		};

		if (portal == "portal") {
			// OR no-portal

			// get all the text from the start of the line to the end of the line
			const getLineText = (text: string, index: number): string => {
				const startOfLine = text.lastIndexOf("\n", index - 1) + 1;
				const endOfLine = text.indexOf("\n", index);
				return text.slice(
					startOfLine,
					endOfLine !== -1 ? endOfLine : undefined
				);
			};

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

			let portalText = line.replace(new RegExp(REFERENCE_REGEX, "g"), "↗");
			let portalTextSlice = portalText.slice(0, PORTAL_TEXT_SLICE_SIZE);

			let portalTextIndex = line.indexOf(match[0]) - matchIndex;

			// getting the portal text selection around the reference
			portalTextSlice = "↗";

			let startPortalText = portalText.substring(
				Math.max(portalTextIndex - 25, 0),
				portalTextIndex
			);
			if (
				portalText.substring(Math.max(portalTextIndex - 25, 0), portalTextIndex)
					.length > 0 &&
				portalTextIndex - 25 > 0
			)
				startPortalText = "..." + startPortalText;

			let endPortalText = portalText.substring(
				portalTextIndex + 1,
				Math.max(portalTextIndex + 25, portalText.length)
			);
			if (
				portalText.substring(
					portalTextIndex + 1,
					Math.max(portalTextIndex + 25, portalText.length)
				).length > 0 &&
				portalTextIndex + 25 < portalText.length
			)
				endPortalText = endPortalText + "...";

			backlinks.push({
				referencedLocation,
				referencingLocation,
				dataString: match[1],
				portalText:
					encodeURIComponentString(startPortalText) +
					":" +
					portalTextSlice +
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

// let debounceTimer: NodeJS.Timeout;
export async function generateBacklinks() {
	// clearTimeout(debounceTimer);
	// debounceTimer = setTimeout(() => {
	console.log("generating references");
	let backlinks: Backlink[] = [];
	let markdownFiles = this.app.vault.getMarkdownFiles();

	await Promise.all(
		markdownFiles.map((file: TFile) => this.app.vault.read(file))
	).then((files) => {
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
	// }, 100);
}

// Should only recompute for the particular page being opened or interacted with
export async function recomputeReferencesForPage(): Promise<Backlink[]> {
	let references: Backlink[] = [];
	let markdownFiles = this.app.vault.getMarkdownFiles();

	let promises = markdownFiles.map((file: TFile) => this.app.vault.read(file));

	let files = await Promise.all(promises);
	const zippedArray = markdownFiles.map((file: TFile, index: number) => ({
		markdownFile: file,
		fileData: files[index],
	}));
	zippedArray.forEach((file: { markdownFile: TFile; fileData: string }) => {
		let fileBacklinks = createBacklinkData(file.fileData, file.markdownFile);
		updateBacklinks(fileBacklinks);

		references.push(...fileBacklinks);
	});
	return references;
}

export async function openBacklinkReference(ev: MouseEvent) {
	let cursor = getCursor();
	let hover = getBacklinkHover();
	let leaf = getThat().workspace.getLeafById(hover.leafId);

	// @ts-ignore
	let container = leaf.containerEl;
	if (!container) throw new Error("Container not found");
	container.querySelector(".view-content").style.boxShadow = "none";

	if (
		cursor &&
		hover &&
		cursor.dataString &&
		hover.dataString &&
		cursor.dataString == hover.dataString
	) {
		updateCursor({
			temp: false,
			cursorViewport: null,
			peek: false,
		});
	}
	updateBacklinkHover({
		temp: false,
		cursorViewport: null,
		peek: false,
	});

	handleRemoveHoveredCursor(ACTION_TYPE.CURSOR);

	resetCursor();
}

export async function openReference(ev: MouseEvent) {
	let cursor = getCursor();
	let hover = getHover();
	let leaf = getThat().workspace.getLeafById(hover.leafId);

	// @ts-ignore
	let container = leaf.containerEl;
	if (!container) throw new Error("Container not found");
	container.querySelector(".view-content").style.boxShadow = "none";

	if (
		cursor &&
		hover &&
		cursor.dataString &&
		hover.dataString &&
		cursor.dataString == hover.dataString
	) {
		updateCursor({
			temp: false,
			cursorViewport: null,
			peek: false,
		});
	}
	updateHover({
		temp: false,
		cursorViewport: null,
		peek: false,
	});

	handleRemoveHoveredCursor(ACTION_TYPE.CURSOR);

	resetCursor();
}
