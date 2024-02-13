import { Plugin, MarkdownView, Notice, WorkspaceLeaf, TFile } from "obsidian";

import {
	updateThat,
	getHover,
	getBacklinkHover,
	getThat,
	updateBacklinks,
} from "./state";
import { highlights, referenceResources } from "./widget";
import { updateClipboard } from "./clipboard";
import {
	generateBacklinks,
	addReferencesToLeaf,
	getMarkdownView,
	getCodeMirrorEditorView,
	createBacklinkData,
	getContainerElement,
} from "./references";
import {
	startReferenceEffect,
	endReferenceHoverEffect,
	startBacklinkEffect,
	endBacklinkHoverEffect,
	delay,
} from "./effects";
import { decodeURIComponentString } from "./utils";
import { ACTION_TYPE, REFERENCE_REGEX } from "./constants";
import { EditorView, ViewUpdate } from "@codemirror/view";
import {
	destroyReferenceWidget,
	serializeReference,
} from "./widget/referenceWidget";
import { collectLeavesByTabHelper } from "./workspace";
import { debounce } from "lodash";

export default class ReferencePlugin extends Plugin {
	onload() {
		updateThat(this);

		setTimeout(async () => {
			await setupPlugin.bind(this)();
		}, 4000); // 4 seconds to allow for the workspace to load

		this.registerEditorExtension([
			highlights,
			referenceResources,
			EditorView.updateListener.of(handleChange),
		]);

		let prevX = 0;
		let prevY = 0;

		this.registerDomEvent(document, "mousemove", async (evt) => {
			// if (evt.metaKey || evt.ctrlKey) return;
			let difference =
				Math.abs(prevX - evt.clientX) + Math.abs(prevY - evt.clientY);
			prevX = evt.clientX;
			prevY = evt.clientY;
			lastMouse = evt;
			if (difference > 10) {
				return;
			}
			await handleMovementEffects(evt);
		});

		this.registerDomEvent(document, "keyup", async (evt) => {
			// backspace is to prevent the backlink from being created when it's deleted
			if (evt.metaKey || evt.ctrlKey || evt.key == "Backspace") return;
			await handleMovementEffects(evt);

			console.log("keyup");
			await debouncedBacklinkCacheUpdate(evt);
		});

		// ------- REGISTERING KEY COMMANDS -------- //
		this.addCommand({
			id: "copy reference",
			name: "copy reference",
			hotkeys: [
				{ modifiers: ["Meta", "Shift"], key: "c" },
				{ modifiers: ["Ctrl", "Shift"], key: "c" },
			],
			callback: () => {
				updateClipboard(true);
				new Notice("Copied reference to clipboard");
			},
		});

		this.addCommand({
			id: "copy reference with toggle",
			name: "copy reference with toggle",
			hotkeys: [
				{ modifiers: ["Ctrl", "Alt", "Shift"], key: "Ç" },
				{ modifiers: ["Meta", "Alt", "Shift"], key: "Ç" },
			],
			callback: () => {
				updateClipboard(false);
				new Notice("Copied reference to clipboard");
			},
		});

		this.registerDomEvent(document, "keydown", async (evt) => {
			if (evt.metaKey || evt.ctrlKey) {
				// Change the cursor style of the body
				await handleMovementEffects(evt);
			}
			// // Copy with toggle off
			if (evt.key == "v" && (evt.metaKey || evt.ctrlKey)) {
				let currentLeaf = getThat().workspace.getLeaf();
				await addReferencesToLeaf(currentLeaf);
			} else if (
				(evt.key == "s" || evt.key == "S") &&
				(evt.metaKey || evt.ctrlKey) &&
				evt.shiftKey
			) {
				const activeLeaf = this.app.workspace.getLeaf();
				toggleSelectedReferences(evt, activeLeaf);
			}
		});
	}

	onunload() {}
}

async function setupPlugin() {
	await generateBacklinks();
	const leaves = this.app.workspace.getLeavesOfType("markdown");

	let promises: Promise<WorkspaceLeaf>[] = leaves.map((leaf: WorkspaceLeaf) => {
		async function updateFunction() {
			if (leaf != null) {
				await addReferencesToLeaf(leaf);
			}
		}

		// Usage example:
		const debouncedFunction = debounce(updateFunction, 400);

		const scroller = getContainerElement(leaf).querySelector(".cm-scroller");

		if (scroller) {
			scroller.removeEventListener("scroll", debouncedFunction);
			scroller.addEventListener("scroll", debouncedFunction);
		}

		return addReferencesToLeaf(leaf);
	});

	await Promise.all(promises);

	this.registerEvent(
		this.app.workspace.on("active-leaf-change", async () => {
			// This should create referenceMarkers if they don't exist and update
			try {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView?.leaf != null) {
					await addReferencesToLeaf(activeView.leaf);
				}
			} catch (e) {
				console.log(e);
			}
		})
	);
}

async function handleChange(e: ViewUpdate) {
	// @ts-ignore -> changedRanges
	let ranges = e.changedRanges;
	if (ranges.length > 0) {
		let fromA = ranges[0].fromA;
		let toA = ranges[0].toA;

		let deletedText = e.startState.doc.slice(fromA, toA);
		// match all reference regex

		const matches = [...deletedText.toString().matchAll(REFERENCE_REGEX)];
		matches.forEach((match) => {
			if (match.index?.toString()) {
				const start: number = match.index;
				const end: number = start + match[0].length;

				let text = deletedText.slice(start, end).toString();
				destroyReferenceWidget(text);
			}
		});
	}

	// this recognizes when a paste event of more than a character has occured
	// if this is a new reference, want to update the referenced page to reflect this
	if (Math.abs(e.changes.desc.newLength - e.changes.desc.length) > 1) {
		// @ts-ignore - this is a private attribute
		let inserted = e.changes.inserted;

		let referencedFile: string | null = null;

		inserted.forEach((change: { length: number; text: string[] }) => {
			change.text.forEach((text) => {
				const regex = /\[↗\]\(urn:([^)]*)\)/g;
				let content = regex.exec(text);
				if (content) {
					const [prefix, text, suffix, file, from, to, portal, toggle] =
						content[1].split(":");
					referencedFile = decodeURIComponentString(file);
				}
			});
		});
		if (!referencedFile) return;

		await delay(2000);
		let markdownFile: TFile | null = getThat().workspace.getActiveFile();
		if (markdownFile instanceof TFile) {
			let fileData = await getThat().vault.read(markdownFile); // I'm pretty sure this is the slow line.

			let fileBacklinks = createBacklinkData(fileData, markdownFile);
			updateBacklinks(fileBacklinks);

			setTimeout(() => {
				let leavesByTab = collectLeavesByTabHelper();
				let leaf = leavesByTab.flat().filter((leaf) => {
					return leaf.getViewState().state.file == referencedFile;
				})[0];
				if (leaf) {
					addReferencesToLeaf(leaf);
				}
			}, 2000); /// this timeout is to make sure the changes have finished writing to file.
		}
	}
}

// Debounced keyup event handler
const debouncedBacklinkCacheUpdate = debounce(async (evt) => {
	// // await updateBacklinkMarkPositions();
	console.log("debounced backlink cache update");

	// await delay(500);
	let markdownFile: TFile | null = getThat().workspace.getActiveFile();
	if (markdownFile instanceof TFile) {
		let fileData = await getThat().vault.read(markdownFile); // I'm pretty sure this is the slow line.
		let fileBacklinks = createBacklinkData(fileData, markdownFile);
		updateBacklinks(fileBacklinks);

		let leaf = getThat().workspace.getLeaf();
		if (leaf) {
			addReferencesToLeaf(leaf);
		}
	}
}, 500); // 500ms debounce time

const toggleSelectedReferences = async (
	evt: KeyboardEvent,
	activeView: WorkspaceLeaf
): Promise<void> => {
	// Toggle all references on line on and off with CMD+SHIFT+S
	const editor = getMarkdownView(activeView).editor;
	const editorView = getCodeMirrorEditorView(editor);

	const selection = editor.getSelection();

	let spans;
	if (selection != "") {
		spans = [...selection.matchAll(REFERENCE_REGEX)]
			.map((match) => {
				let referenceData = editorView.contentDOM.querySelector(
					`[data="${match[1]}"]`
				);
				let referenceSpan =
					referenceData?.parentElement?.querySelector(".reference-span");

				return referenceSpan;
			})
			.filter((span) => span != null) as HTMLSpanElement[];
	} else {
		// grab all references on active line
		let target = evt.target as HTMLElement;
		let children = Array.from(target.children);
		let currentLine = children.filter((child) =>
			child.classList.contains("cm-active")
		)[0];

		spans = Array.from<HTMLSpanElement>(
			currentLine.querySelectorAll(".reference-span")
		);
	}

	if (!spans) return;

	// check if any are hidden
	let hasOneHidden = false;
	spans.forEach((span) => {
		if (span.classList.contains("reference-span-hidden")) {
			hasOneHidden = true;
		}
	});

	new Notice(hasOneHidden ? "Toggle annotations on" : "Toggle annotations off");

	for (const span of spans) {
		// Want to serialize references at some point
		let referenceSpan = span.parentElement?.querySelector(
			".reference-data-span"
		);
		let content = referenceSpan?.getAttribute("data");

		if (span.classList.contains("reference-span-hidden") && hasOneHidden) {
			span.classList.remove("reference-span-hidden");
		} else if (
			!span.classList.contains("reference-span-hidden") &&
			!hasOneHidden
		) {
			span.classList.add("reference-span-hidden");
		}
		await serializeReference(
			content,
			span,
			editorView,
			hasOneHidden ? "t" : "f"
		);
	}
};

let lastMouse: MouseEvent | null = null;
export async function handleMovementEffects(
	evt: MouseEvent | KeyboardEvent
): Promise<void> {
	let span;

	if (
		evt.target &&
		(evt.target instanceof HTMLSpanElement ||
			evt.target instanceof SVGElement ||
			evt.target instanceof SVGPathElement)
	) {
		// If element is svg, find the containing parent span
		span = evt.target;
		while (!(span instanceof HTMLSpanElement) && span.parentElement != null) {
			span = span.parentElement;
		}
	} else if (lastMouse) {
		const mouseX = lastMouse.clientX;
		const mouseY = lastMouse.clientY;
		span = document.elementFromPoint(mouseX, mouseY);
	}

	// if key not pressed, mouse movement should end hover effect immediately
	if (!evt.metaKey && !evt.ctrlKey) {
		if (
			span &&
			span instanceof HTMLSpanElement &&
			span.getAttribute("reference")
		) {
			console.log("start hover backlink effect");
			// if (getBacklinkHover() != null) return;
			await startBacklinkEffect(span);
		} else if (getHover() != null && !span?.classList.contains("cm-line")) {
			console.log("end reference hover effect");
			await endReferenceHoverEffect();
		} else if (getBacklinkHover() != null) {
			console.log("end backlink hover effect");
			await endBacklinkHoverEffect();
		}
	} else {
		if (
			span &&
			span instanceof HTMLSpanElement &&
			span?.parentElement &&
			span?.parentElement.classList.contains("reference-container-span")
		) {
			console.log("start hover reference effect");
			// if (getHover() != null) return;
			if (!span.getAttribute("data")) {
				span = span.parentElement;
				span = span.querySelector(".reference-data-span") as HTMLSpanElement;
				if (!span) throw new Error("Span element not found");
			}
			// updateReferenceColor(span, ACTION_TYPE.MOUSE);
			await startReferenceEffect(span, ACTION_TYPE.MOUSE);
		} else if (
			span &&
			span instanceof HTMLSpanElement &&
			span.getAttribute("reference")
		) {
			console.log("start hover backlink effect");
			// if (getBacklinkHover() != null) return;
			await startBacklinkEffect(span);
		} else if (getHover() != null) {
			console.log("end hover reference effect");
			// Define the keys you're waiting for
			const requiredKeys = [
				"dataString",
				"leafId",
				"originalLeafId",
				"temp",
				"cursorViewport",
				"peek",
				"uuid",
			];
			// Function to check if all required keys are present

			const allKeysPresent = () =>
				requiredKeys.every((key) => key in getHover());
			// Wait until all keys are present
			if (!allKeysPresent()) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			await endReferenceHoverEffect();
		} else if (getBacklinkHover() != null) {
			console.log("end hover backlink effect");
			// Define the keys you're waiting for
			const requiredKeys = [
				"dataString",
				"leafId",
				"originalLeafId",
				"backlinkLeafId",
				"temp",
				"cursorViewport",
				"peek",
				"uuid",
				"backlinkUUID",
			];
			// Function to check if all required keys are present
			const allKeysPresent = () =>
				requiredKeys.every((key) => key in getBacklinkHover());
			// Wait until all keys are present
			if (!allKeysPresent()) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			await endBacklinkHoverEffect();
		}
	}
	return;
}
