import { Plugin, MarkdownView, Notice, Editor } from "obsidian";

import { updateThat, getThat, getHover, getBacklinks } from "./state";
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
} from "./effects";
import { checkFocusCursor, handleRemoveHoveredCursor } from "./utils";
import { ACTION_TYPE, SVG_HOVER_COLOR } from "./constants";
import { EditorView, ViewUpdate } from "@codemirror/view";

export default class ReferencePlugin extends Plugin {
	onload() {
		setTimeout(() => {
			generateBacklinks();
			this.registerEvent(
				this.app.workspace.on("active-leaf-change", (ev) => {
					// console.log("active-leaf-changed:");
					// This should create referenceMarkers if they don't exist and update
					// else update only

					try {
						const activeView =
							this.app.workspace.getActiveViewOfType(MarkdownView);
						if (activeView?.leaf != null) {
							addReferencesToLeaf(activeView.leaf);
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

			// const semiMode = evt.metaKey || evt.ctrlKey;
			let span;
			let dataString;
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
				span.getAttribute("data")
			) {
				// console.log("start hover reference effect");
				updateHoveredCursorColor(span, ACTION_TYPE.MOUSE);
				startReferenceEffect(span, ACTION_TYPE.MOUSE);
			} else if (
				span &&
				span instanceof HTMLSpanElement &&
				span.getAttribute("reference")
			) {
				// console.log("start backlink effect");
				// updateHoveredCursorColor(span, ACTION_TYPE.BACKLINK);
				startBacklinkEffect(span);
			} else if (getHover() != null) {
				// console.log("end hover reference effect");
				endReferenceHoverEffect();
				handleRemoveHoveredCursor(ACTION_TYPE.MOUSE);
			} else if (getBacklinks() != null) {
				// console.log("end backlink reference effect");
				endBacklinkHoverEffect();
			}
		});

		// on selection changes, event over click and keydown

		this.registerDomEvent(document, "click", async (evt) => {
			if (evt.metaKey || evt.ctrlKey) return;
			checkFocusCursor(evt);
			updateBacklinkMarkPositions();
		});

		this.registerDomEvent(document, "keyup", async (evt) => {
			if (evt.metaKey || evt.ctrlKey) return;

			// console.log("keyup");
			checkFocusCursor(evt);
			// updateBacklinkMarkPositions();
			updateBacklinkMarkPositions();
		});

		this.registerDomEvent(document, "keydown", async (evt) => {
			// console.log("keydown");

			if (evt.key == "c" && evt.metaKey && evt.shiftKey) {
				// console.log("c");
				updateClipboard(true);
				new Notice("Copied reference to clipboard");
			} else if (evt.key == "r" && evt.metaKey && evt.shiftKey) {
				// console.log("r");
				updateClipboard(false);
				new Notice("Copied reference to clipboard");
			} else if (evt.key == "e" && evt.metaKey && evt.shiftKey) {
				// find the annotations file
				// if it doesn't exist, create it
				// if it exists, open it in adjacent panel
				// add new annotation
				updateClipboard(false, true);
				new Notice("New annotation");
			} else if (evt.key == "s" && evt.metaKey && evt.shiftKey) {
				const editor: Editor | undefined =
					this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
				if (!editor) return;
				const cursor = editor.getCursor();

				// @ts-ignore
				const element = editor.getDoc().cm.contentDOM;
				const lines = element.querySelectorAll(".cm-line");
				const currentLine = lines[cursor.line];
				const spans = currentLine.querySelectorAll(".reference-span");
				const spanStates = Array.from(spans).map(
					(span: HTMLSpanElement) => span.style.display
				);

				if (
					spanStates.every((state) => state === "inline") ||
					spanStates.every((state) => state === "")
				) {
					spans.forEach((span: HTMLSpanElement) => {
						span.style.display = "none";
					});
					new Notice("Toggle annotations off");
				} else {
					spans.forEach((span: HTMLSpanElement) => {
						if (span.style.display === "" || span.style.display === "none")
							span.style.display = "inline";
					});
					new Notice("Toggle annotations on");
				}

				// Find the element at line
				// get all span elements, update their display style
				// the appropriate updates to state will occur automatically via observer
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
