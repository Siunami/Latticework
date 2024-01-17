import { Plugin, MarkdownView, Notice } from "obsidian";

import {
	updateThat,
	getHover,
	getBacklinks,
	getBacklinkHover,
	getThat,
	getCursor,
} from "./state";
import { highlights, referenceResources } from "./widget";
import { updateClipboard } from "./clipboard";
import {
	generateBacklinks,
	addReferencesToLeaf,
	updateBacklinkMarkPositions,
	updateHoveredCursorColor,
} from "./references";
import {
	startReferenceEffect,
	endReferenceHoverEffect,
	startBacklinkEffect,
	endBacklinkHoverEffect,
	endReferenceCursorEffect,
} from "./effects";
import { checkFocusCursor, handleRemoveHoveredCursor } from "./utils";
import { ACTION_TYPE } from "./constants";
import { EditorView } from "@codemirror/view";
import { serializeReference } from "./widget/referenceWidget";

export default class ReferencePlugin extends Plugin {
	onload() {
		setTimeout(() => {
			generateBacklinks();
			this.registerEvent(
				this.app.workspace.on("active-leaf-change", async (ev) => {
					// console.log("active-leaf-changed:");
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
			EditorView.updateListener.of(function (e) {
				if (Math.abs(e.changes.desc.newLength - e.changes.desc.length) > 1) {
					updateBacklinkMarkPositions();
				}
			}),
		]);

		this.registerDomEvent(document, "mousemove", async (evt) => {
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

				while (
					!(span instanceof HTMLSpanElement) &&
					span.parentElement != null
				) {
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
				const allKeysPresent = () =>
					requiredKeys.every((key) => key in getHover());

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
			// console.log("keydown");

			if (evt.key == "Ç" && evt.metaKey && evt.shiftKey && evt.altKey) {
				// console.log("c");
				updateClipboard(false);
				new Notice("Copied reference to clipboard");
			} else if (evt.key == "c" && evt.metaKey && evt.shiftKey) {
				// console.log("r");
				updateClipboard(true);
				new Notice("Copied reference to clipboard");
			} else if (evt.key == "s" && evt.metaKey && evt.shiftKey) {
				let target = evt.target as HTMLElement;
				let children = Array.from(target.children);
				let currentLine = children.filter((child) =>
					child.classList.contains("cm-active")
				)[0];

				const spans = Array.from<HTMLSpanElement>(
					currentLine.querySelectorAll(".reference-span")
				);

				if (
					spans.every((span) =>
						span.classList.contains("reference-span-hidden")
					) ||
					(!spans.every((span) =>
						span.classList.contains("reference-span-hidden")
					) &&
						spans.reduce((acc, span) => {
							if (acc) return acc;
							return span.classList.contains("reference-span-hidden");
						}, false))
				) {
					spans.forEach((span) => {
						span.classList.toggle("reference-span-hidden", false);
						// Want to serialize references at some point
						// console.log(span);
						// getThat().workspace.getLeaf().view;

						// serializeReference(span)
					});
					new Notice("Toggle annotations on");
				} else {
					spans.forEach((span: HTMLSpanElement) => {
						spans.forEach((span) => {
							span.classList.toggle("reference-span-hidden", true);
						});
					});
					new Notice("Toggle annotations off");
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
