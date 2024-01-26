import {
	Plugin,
	MarkdownView,
	Notice,
	WorkspaceLeaf,
	TFile,
	TAbstractFile,
} from "obsidian";

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
	updateReferenceColor,
	createBacklinkMark,
	createBacklinkData,
} from "./references";
import {
	startReferenceEffect,
	endReferenceHoverEffect,
	startBacklinkEffect,
	endBacklinkHoverEffect,
	delay,
} from "./effects";
import { decodeURIComponentString } from "./utils";
import { ACTION_TYPE } from "./constants";
import { EditorView } from "@codemirror/view";
import { serializeReference } from "./widget/referenceWidget";
import { collectLeavesByTabHelper } from "./workspace";

let lastMouse: MouseEvent | null = null;
export async function handleMovementEffects(evt: MouseEvent | KeyboardEvent) {
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
		if (getHover() != null) {
			await endReferenceHoverEffect();
		} else if (getBacklinkHover() != null) {
			await endBacklinkHoverEffect();
		}
		return;
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
			updateReferenceColor(span, ACTION_TYPE.MOUSE);
			startReferenceEffect(span, ACTION_TYPE.MOUSE);
		} else if (
			span &&
			span instanceof HTMLSpanElement &&
			span.getAttribute("reference")
		) {
			console.log("start hover backlink effect");
			// if (getBacklinkHover() != null) return;
			startBacklinkEffect(span);
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
}

export default class ReferencePlugin extends Plugin {
	onload() {
		//
		setTimeout(async () => {
			await generateBacklinks();
			const leaves = this.app.workspace.getLeavesOfType("markdown");

			let promises: Promise<WorkspaceLeaf>[] = leaves.map(
				(leaf: WorkspaceLeaf) => {
					return addReferencesToLeaf(leaf);
				}
			);

			await Promise.all(promises);

			this.registerEvent(
				this.app.workspace.on("active-leaf-change", async (ev) => {
					// This should create referenceMarkers if they don't exist and update
					// else update only
					try {
						const activeView =
							this.app.workspace.getActiveViewOfType(MarkdownView);
						if (activeView?.leaf != null) {
							await addReferencesToLeaf(activeView.leaf);
						}
					} catch (e) {
						console.log(e);
					}
				})
			);
		}, 4000);

		updateThat(this);

		this.registerEditorExtension([
			highlights,
			referenceResources,
			EditorView.updateListener.of(async function (e) {
				// this recognizes when a paste event of more than a character has occured
				// if this is a new reference, want to update the referenced page to reflect this
				if (Math.abs(e.changes.desc.newLength - e.changes.desc.length) > 1) {
					console.log("NEW PASTE EVENT");

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
						console.log(fileBacklinks);
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
			}),
		]);

		let prevX = 0;
		let prevY = 0;

		this.registerDomEvent(document, "mousemove", async (evt) => {
			let difference =
				Math.abs(prevX - evt.clientX) + Math.abs(prevY - evt.clientY);
			prevX = evt.clientX;
			prevY = evt.clientY;
			lastMouse = evt;
			if (difference > 10) {
				return;
			}
			handleMovementEffects(evt);
		});

		// // on selection changes, event over click and keydown
		// this.registerDomEvent(document, "click", async (evt) => {
		// 	console.log("click");
		// 	handleMovementEffects(evt);
		// 	// await checkFocusCursor(evt);
		// 	updateBacklinkMarkPositions();
		// });

		this.registerDomEvent(document, "keyup", async (evt) => {
			if (evt.metaKey || evt.ctrlKey || evt.key === "Backspace") return;
			console.log(evt);
			console.log("keyup");
			handleMovementEffects(evt);
			// await checkFocusCursor(evt);
			// updateBacklinkMarkPositions();
		});

		this.registerDomEvent(document, "keydown", async (evt) => {
			if (evt.metaKey || evt.ctrlKey) {
				// Change the cursor style of the body
				handleMovementEffects(evt);
			}
			// Copy with toggle off
			if (evt.key == "v" && (evt.metaKey || evt.ctrlKey)) {
				console.log("hello");
				let currentLeaf = getThat().workspace.getLeaf();
				await addReferencesToLeaf(currentLeaf);
			} else if (
				evt.key == "Ç" &&
				(evt.metaKey || evt.ctrlKey) &&
				evt.shiftKey &&
				evt.altKey
			) {
				updateClipboard(false);
				new Notice("Copied reference to clipboard");
			} else if (
				(evt.key == "c" || evt.key == "C") &&
				(evt.metaKey || evt.ctrlKey) &&
				evt.shiftKey
			) {
				// Copy with toggle on
				updateClipboard(true);
				new Notice("Copied reference to clipboard");
			} else if (
				(evt.key == "s" || evt.key == "S") &&
				(evt.metaKey || evt.ctrlKey) &&
				evt.shiftKey
			) {
				// Copy with S on
				let target = evt.target as HTMLElement;
				let children = Array.from(target.children);
				let currentLine = children.filter((child) =>
					child.classList.contains("cm-active")
				)[0];

				const spans = Array.from<HTMLSpanElement>(
					currentLine.querySelectorAll(".reference-span")
				);

				let hasOneHidden = false;
				spans.forEach((span) => {
					if (span.classList.contains("reference-span-hidden")) {
						hasOneHidden = true;
					}
				});

				if (
					spans.every((span) =>
						span.classList.contains("reference-span-hidden")
					) ||
					hasOneHidden
				) {
					new Notice("Toggle annotations on");

					for (const span of spans) {
						// Want to serialize references at some point
						let referenceSpan = span.parentElement?.querySelector(
							".reference-data-span"
						);
						let content = referenceSpan?.getAttribute("data");
						const activeView = this.app.workspace.getLeaf();
						const editor = getMarkdownView(activeView).editor;
						const editorView = getCodeMirrorEditorView(editor);

						await serializeReference(content, span, editorView, "f");

						if (!span.classList.contains("reference-span-hidden")) {
							span.classList.add("reference-span-hidden");
						}

						span.classList.remove("reference-span-hidden");
					}
				} else {
					new Notice("Toggle annotations off");

					for (const span of spans) {
						let referenceSpan = span.parentElement?.querySelector(
							".reference-data-span"
						);

						let content = referenceSpan?.getAttribute("data");
						const activeView = this.app.workspace.getLeaf();
						const editor = getMarkdownView(activeView).editor;
						const editorView = getCodeMirrorEditorView(editor);

						await serializeReference(content, span, editorView, "t");

						// Remove the class if it exists
						if (span.classList.contains("reference-span-hidden")) {
							span.classList.remove("reference-span-hidden");
						}

						// Add the class
						span.classList.add("reference-span-hidden");
					}
				}
			}
		});
	}

	onunload() {}
}
