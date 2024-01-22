import { Plugin, MarkdownView, Notice, WorkspaceLeaf } from "obsidian";

import {
	updateThat,
	getHover,
	getBacklinks,
	getBacklinkHover,
	getThat,
	getCursor,
	resetHover,
	updateCursor,
} from "./state";
import { highlights, referenceResources } from "./widget";
import { updateClipboard } from "./clipboard";
import {
	generateBacklinks,
	addReferencesToLeaf,
	updateBacklinkMarkPositions,
	updateHoveredCursorColor,
	getMarkdownView,
	getBacklinkContainer,
	getCodeMirrorEditorView,
	getContainerElement,
} from "./references";
import {
	startReferenceEffect,
	endReferenceHoverEffect,
	startBacklinkEffect,
	endBacklinkHoverEffect,
	endReferenceCursorEffect,
	delay,
} from "./effects";
import { checkFocusCursor, handleRemoveHoveredCursor } from "./utils";
import { ACTION_TYPE } from "./constants";
import { EditorView } from "@codemirror/view";
import { serializeReference } from "./widget/referenceWidget";
import { defaultHighlightSelection, removeHighlights } from "./mark";

export function generateDefaultHighlights(leaf: WorkspaceLeaf) {
	const editor = getMarkdownView(leaf).editor;
	const backlinkContainer = getBacklinkContainer(editor);

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
			let editorView = getCodeMirrorEditorView(editor);
			removeHighlights(editorView);

			defaultHighlightSelection(editorView, referenceFrom, referenceTo);
		}
	}
}

export async function handleMovementEffects(evt: MouseEvent) {
	if (evt.metaKey || evt.ctrlKey) return;

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
	}
	if (
		span &&
		span instanceof HTMLSpanElement &&
		span?.parentElement &&
		span?.parentElement.classList.contains("reference-container-span")
	) {
		console.log("start hover reference effect");
		if (getHover() != null) return;
		if (!span.getAttribute("data")) {
			span = span.parentElement;
			span = span.querySelector(".reference-data-span") as HTMLSpanElement;
			if (!span) throw new Error("Span element not found");
		}
		updateHoveredCursorColor(span, ACTION_TYPE.MOUSE);
		startReferenceEffect(span, ACTION_TYPE.MOUSE);
	} else if (
		span &&
		span instanceof HTMLSpanElement &&
		span.getAttribute("reference")
	) {
		console.log("start hover backlink effect");
		if (getBacklinkHover() != null) return;
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
		const allKeysPresent = () => requiredKeys.every((key) => key in getHover());
		// Wait until all keys are present
		if (!allKeysPresent()) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		await endReferenceHoverEffect();
		handleRemoveHoveredCursor(ACTION_TYPE.MOUSE);
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
		console.log("start end backlink effect!!!!!");
		await endBacklinkHoverEffect();
	} else {
	}
	// else {
	// 	// console.log("end hover reference effect");
	// 	endReferenceHoverEffect();
	// 	handleRemoveHoveredCursor(ACTION_TYPE.MOUSE);
	// }
}

export default class ReferencePlugin extends Plugin {
	onload() {
		setTimeout(async () => {
			await generateBacklinks();
			const leaves = this.app.workspace.getLeavesOfType("markdown");

			let promises: Promise<WorkspaceLeaf>[] = leaves.map(
				(leaf: WorkspaceLeaf) => {
					// await addReferencesToLeaf(leaf);
					return addReferencesToLeaf(leaf);
				}
			);

			Promise.all(promises).then(async (leaves: WorkspaceLeaf[]) => {
				await delay(2000);
				leaves.forEach((leaf: WorkspaceLeaf) => {
					generateDefaultHighlights(leaf);
					// const editor = getMarkdownView(leaf).editor;
					// const backlinkContainer = getBacklinkContainer(editor);

					// let backlinks = [];
					// for (let i = 0; i < backlinkContainer.children.length; i++) {
					// 	backlinks.push(backlinkContainer.children.item(i) as HTMLElement);
					// }

					// for (let backlink of backlinks) {
					// 	let reference = backlink.getAttribute("reference")
					// 		? JSON.parse(backlink.getAttribute("reference")!)
					// 		: null;
					// 	if (reference) {
					// 		let referenceFrom = reference.referencedLocation.from;
					// 		let referenceTo = reference.referencedLocation.to;
					// 		let editorView = getCodeMirrorEditorView(editor);
					// 		defaultHighlightSelection(editorView, referenceFrom, referenceTo);
					// 	}
					// }
				});
			});

			this.registerEvent(
				this.app.workspace.on("active-leaf-change", async (ev) => {
					// This should create referenceMarkers if they don't exist and update
					// else update only

					try {
						const activeView =
							this.app.workspace.getActiveViewOfType(MarkdownView);
						if (activeView?.leaf != null) {
							await addReferencesToLeaf(activeView.leaf);
							await delay(2000);

							generateDefaultHighlights(activeView.leaf);

							// let container = getContainerElement(activeView.leaf);
							// const editor = getMarkdownView(activeView.leaf).editor;
							// const backlinkContainer = getBacklinkContainer(editor);

							// let backlinks = [];
							// for (let i = 0; i < backlinkContainer.children.length; i++) {
							// 	backlinks.push(
							// 		backlinkContainer.children.item(i) as HTMLElement
							// 	);
							// }

							// for (let backlink of backlinks) {
							// 	let reference = backlink.getAttribute("reference")
							// 		? JSON.parse(backlink.getAttribute("reference")!)
							// 		: null;
							// 	if (reference) {
							// 		console.log(reference);
							// 		let referenceFrom = reference.referencedLocation.from;
							// 		let referenceTo = reference.referencedLocation.to;
							// 		let editorView = getCodeMirrorEditorView(editor);
							// 		defaultHighlightSelection(
							// 			editorView,
							// 			referenceFrom,
							// 			referenceTo
							// 		);
							// 	}
							// }
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
			EditorView.updateListener.of(function (e) {
				if (Math.abs(e.changes.desc.newLength - e.changes.desc.length) > 1) {
					updateBacklinkMarkPositions();
				}
			}),
		]);

		// this.registerDomEvent(document, "scroll", async (evt) => {
		// 	console.log(evt);
		// 	handleMovementEffects(evt as MouseEvent);
		// });

		let prevX = 0;
		let prevY = 0;

		this.registerDomEvent(document, "mousemove", async (evt) => {
			let difference =
				Math.abs(prevX - evt.clientX) + Math.abs(prevY - evt.clientY);
			prevX = evt.clientX;
			prevY = evt.clientY;
			if (difference > 10) {
				return;
			}
			handleMovementEffects(evt);
		});

		// on selection changes, event over click and keydown

		this.registerDomEvent(document, "click", async (evt) => {
			console.log("click");
			await checkFocusCursor(evt);
			updateBacklinkMarkPositions();

			// if (evt.metaKey || evt.ctrlKey) return;
			// await endReferenceCursorEffect();
		});

		this.registerDomEvent(document, "keyup", async (evt) => {
			if (evt.metaKey || evt.ctrlKey) return;

			// console.log("keyup");
			await checkFocusCursor(evt);
			updateBacklinkMarkPositions();
			// updateBacklinkMarkPositions();
		});

		this.registerDomEvent(document, "keydown", async (evt) => {
			// if (evt.key == "Backspace") {
			// 	updateCursor({
			// 		removed: true,
			// 	});
			// }

			// console.log("keydown");

			// console.log(evt.key);

			// console.log(evt.shiftKey);

			// console.log(evt.ctrlKey);
			// console.log(evt.metaKey);

			// console.log(
			// 	evt.key == "s" && (evt.metaKey || evt.ctrlKey) && evt.shiftKey
			// );
			if (
				evt.key == "Ç" &&
				(evt.metaKey || evt.ctrlKey) &&
				evt.shiftKey &&
				evt.altKey
			) {
				// console.log("c");
				updateClipboard(false);
				new Notice("Copied reference to clipboard");
			} else if (
				(evt.key == "c" || evt.key == "C") &&
				(evt.metaKey || evt.ctrlKey) &&
				evt.shiftKey
			) {
				// console.log("r");
				updateClipboard(true);
				new Notice("Copied reference to clipboard");
			} else if (
				(evt.key == "s" || evt.key == "S") &&
				(evt.metaKey || evt.ctrlKey) &&
				evt.shiftKey
			) {
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
				// // spans.reduce((acc, span) => {
				// // 	if (acc) return acc;
				// // 	return span.classList.contains("reference-span-hidden");
				// // }, false))

				// console.log(
				// 	spans.every((span) =>
				// 		span.classList.contains("reference-span-hidden")
				// 	)
				// );

				// console.log(
				// 	!spans.every((span) =>
				// 		span.classList.contains("reference-span-hidden")
				// 	) && hasOneHidden
				// );

				// console.log(
				// 	!spans.every((span) =>
				// 		span.classList.contains("reference-span-hidden")
				// 	)
				// );
				if (
					spans.every((span) =>
						span.classList.contains("reference-span-hidden")
					) ||
					hasOneHidden
					// spans.every((span) =>
					// 	span.classList.contains("reference-span-hidden")
					// ) ||
					// (!spans.every((span) =>
					// 	span.classList.contains("reference-span-hidden")
					// ) &&
					// 	hasOneHidden)
				) {
					new Notice("Toggle annotations on");

					// spans.forEach(async (span) => {
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
						console.log(span);
						if (!span.classList.contains("reference-span-hidden")) {
							span.classList.add("reference-span-hidden");
							// Allow the browser to re-render the element
							// await new Promise((resolve) => setTimeout(resolve, 0));
						}
						span.classList.remove("reference-span-hidden");
						// Allow the browser to re-render the element
						// await new Promise((resolve) => setTimeout(resolve, 0));
						// const cursor = editor.getCursor();
						// editor.replaceRange(" ", cursor, cursor);
						// editor.undo();
						// });
					}
				} else {
					new Notice("Toggle annotations off");

					// spans.forEach(async (span: HTMLSpanElement) => {
					// 	let referenceSpan = span.parentElement?.querySelector(
					// 		".reference-data-span"
					// 	);
					// 	let content = referenceSpan?.getAttribute("data");
					// 	const activeView = this.app.workspace.getLeaf();
					// 	const editor = getMarkdownView(activeView).editor;
					// 	const editorView = getCodeMirrorEditorView(editor);

					// 	await serializeReference(content, span, editorView, "t");
					// 	console.log(span);
					// 	span.classList.remove("reference-span-hidden");

					// 	if (!span.classList.contains("reference-span-hidden")) {
					// 		span.classList.add("reference-span-hidden");
					// 	}
					// });

					for (const span of spans) {
						let referenceSpan = span.parentElement?.querySelector(
							".reference-data-span"
						);
						let content = referenceSpan?.getAttribute("data");
						const activeView = this.app.workspace.getLeaf();
						const editor = getMarkdownView(activeView).editor;
						const editorView = getCodeMirrorEditorView(editor);

						await serializeReference(content, span, editorView, "t");
						console.log(span);

						// Remove the class if it exists
						if (span.classList.contains("reference-span-hidden")) {
							span.classList.remove("reference-span-hidden");
							// Allow the browser to re-render the element
							// await new Promise((resolve) => setTimeout(resolve, 0));
						}

						// Add the class
						span.classList.add("reference-span-hidden");
						// Allow the browser to re-render the element
						// await new Promise((resolve) => setTimeout(resolve, 0));
						// const cursor = editor.getCursor();
						// editor.replaceRange(" ", cursor, cursor);
						// editor.undo();
					}
				}
			}
		});

		// getThat().workspace.on("editor-change", (ev) => {
		// 	console.log(ev);
		// });

		// this.registerEvent(
		// 	this.app.workspace.on("window-close", (ev) => {
		// 		console.log("window closed:");
		// 		console.log(ev);
		// 	})
		// );

		// this.registerEvent(
		// 	this.app.workspace.on("editor-drop", (ev) => {
		// 		console.log("Editor dropped:");
		// 		console.log(ev);
		// 	})
		// );

		// this.registerEvent(
		// 	this.app.workspace.on("window-open", (ev) => {
		// 		console.log("window opened:");
		// 		// console.log(ev);
		// 	})
		// );

		// this.registerEvent(
		// 	this.app.workspace.on("resize", () => {
		// 		console.log("resize");
		// 	})
		// );

		// this.registerEvent(
		// 	this.app.workspace.on("file-open", (ev) => {
		// 		console.log("file opened:");
		// 		// console.log(ev);
		// 		// console.log(getReferences());

		// 		let currentLeaf: any = this.app.workspace.getLeaf();

		// 		// check it references have already been created, else create references
		// 	})
		// );

		// this.registerEvent(
		// 	this.app.workspace.on("layout-change", () => {
		// 		console.log("layout-changed:");
		// 	})
		// );
	}

	onunload() {}
}
