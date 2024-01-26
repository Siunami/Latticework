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
import {
	PORTAL_TEXT_SLICE_SIZE,
	REFERENCE_REGEX,
	SVG_HOVER_COLOR,
} from "./constants";
import { DocumentLocation, Backlink } from "./types";
import { v4 as uuidv4 } from "uuid";
import { delay } from "./effects";
import { defaultHighlightSelection } from "./mark";

export function generateDefaultHighlights(leaf: WorkspaceLeaf) {
	const editor = getMarkdownView(leaf).editor;
	const backlinkContainer = getBacklinkContainer(editor);
	let editorView = getCodeMirrorEditorView(editor);

	let backlinks = [];
	for (let i = 0; i < backlinkContainer.children.length; i++) {
		backlinks.push(backlinkContainer.children.item(i) as HTMLElement);
	}

	for (let backlink of backlinks) {
		let reference = backlink.getAttribute("reference")
			? JSON.parse(backlink.getAttribute("reference")!)
			: null;
		if (reference) {
			let referenceFrom = reference.referencedLocation.from;
			let referenceTo = reference.referencedLocation.to;

			defaultHighlightSelection(editorView, referenceFrom, referenceTo);
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

export function layoutBacklinks(
	leaf: WorkspaceLeaf,
	backlinksToLeaf: Backlink[],
	showPortals: boolean
) {
	const editor = getMarkdownView(leaf).editor;
	const backlinkContainer = getBacklinkContainer(editor);

	// Get all existing
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
	// let margin = 4;
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
				if (portal) {
					portal.style.display = "inline";
					marker.classList.add("backlink-span");
				}
			} else {
				if (portal) {
					portal.style.display = "none";
				}
				marker.classList.remove("backlink-span");
			}

			// get positioning
			let top = parseInt(marker!.getAttribute("top")!);
			// top = Math.max(top, lastYBottom + margin);
			top = Math.max(top, lastYBottom);
			// lastYBottom = top + marker.getBoundingClientRect().height + margin;
			lastYBottom = top + marker.getBoundingClientRect().height;
			marker.setAttribute("top", top.toString());
			marker.style.top = top - titleBbox.top + 32 + "px";
			marker.style.left = lineBbox.width + 40 + "px";
		});
}

let debounceTimer: NodeJS.Timeout;

export async function updateBacklinkMarkPositions() {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(async () => {
		console.log("updatebacklinkmarkpositions");
		const leaves = getThat().workspace.getLeavesOfType(
			"markdown"
		) as WorkspaceLeaf[];

		let allBacklinks: Backlink[] = getBacklinks();
		console.log(allBacklinks);

		// console.log(getBacklinks());
		// if (!backlinks) allBacklinks = await generateBacklinks();
		// else allBacklinks = backlinks;
		// console.log(allBacklinks);

		// const allBacklinks: Backlink[] = await generateBacklinks();

		// leaves.map(async (leaf) => {
		// 	const backlinksToLeaf = allBacklinks.filter(
		// 		// @ts-ignore
		// 		(b) => b.referencedLocation.filename == leaf.view.file.path
		// 	);
		// 	// width 900, show the reference
		// 	const showPortals = getContainerElement(leaf).innerWidth > 900;
		// 	layoutBacklinks(leaf, backlinksToLeaf, showPortals);
		// });
		const promises = leaves.map(async (leaf) => {
			let file = getMarkdownView(leaf)?.file;
			if (file) {
				const backlinksToLeaf = allBacklinks.filter(
					// @ts-ignore
					(b) => b.referencedLocation.filename == file.path
				);
				// width 900, show the reference
				const showPortals = getContainerElement(leaf).innerWidth > 900;
				layoutBacklinks(leaf, backlinksToLeaf, showPortals);
				generateDefaultHighlights(leaf);
			}
		});

		await Promise.all(promises);
	}, 100);

	// console.log("updatebacklinkmarkpositions");
	// const leaves = getThat().workspace.getLeavesOfType(
	// 	"markdown"
	// ) as WorkspaceLeaf[];

	// let allBacklinks: Backlink[] = getBacklinks();
	// console.log(allBacklinks);

	// const promises = leaves.map(async (leaf) => {
	// 	let file = getMarkdownView(leaf)?.file;
	// 	if (file) {
	// 		const backlinksToLeaf = allBacklinks.filter(
	// 			// @ts-ignore
	// 			(b) => b.referencedLocation.filename == file.path
	// 		);
	// 		// width 900, show the reference
	// 		const showPortals = getContainerElement(leaf).innerWidth > 900;
	// 		layoutBacklinks(leaf, backlinksToLeaf, showPortals);
	// 		generateDefaultHighlights(leaf);
	// 	}
	// });

	// await Promise.all(promises);
}

export function createBacklinkMark(backlink: Backlink): HTMLElement {
	let span = createReferenceIcon(backlink.portalText);
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

// Keep track of the existing observer and listener
let existingObserver: ResizeObserver | null = null;
let existingListener: ((ev: Event) => any) | null = null;

export async function addReferencesToLeaf(leaf: WorkspaceLeaf) {
	console.log("add references to leaf");
	console.log("initial load");

	await updateBacklinkMarkPositions();
	// await delay(1000);

	// const scroller = getContainerElement(markdownView.editor).querySelector(
	// 	".cm-scroller"
	// )!;

	// // Remove the existing listener before adding a new one
	// if (existingListener) {
	// 	scroller.removeEventListener("scroll", existingListener);
	// }

	// const newListener = async (ev: Event) => {
	// 	await updateBacklinkMarkPositions();
	// 	await delay(2000);
	// 	console.log("scroll load");

	// 	generateDefaultHighlights(leaf);
	// };

	// scroller.addEventListener("scroll", newListener);

	// // Update the existing listener
	// existingListener = newListener;

	// Remove the existing observer before creating a new one
	if (existingObserver) {
		existingObserver.disconnect();
	}

	const newObserver = new ResizeObserver(async () => {
		await updateBacklinkMarkPositions();
		await delay(1000);
		console.log("resize load");
		generateDefaultHighlights(leaf);
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

export function createBacklinkData(
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

export async function generateBacklinks(): Promise<Backlink[]> {
	console.log("generating references");
	// setTimeout(async () => {
	let backlinks: Backlink[] = [];
	let markdownFiles = await this.app.vault.getMarkdownFiles();

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
	return backlinks;
	// }, 0);
}

export function updateReferenceColor(span: HTMLSpanElement, user: string) {
	// remove existing cursors
	const portal: HTMLElement | null = span.querySelector(".portal");

	if (span && !portal) {
		span.style.backgroundColor = SVG_HOVER_COLOR;
	}
}

export async function openBacklinkReference(ev: MouseEvent) {
	let hover = getBacklinkHover();
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
