import { Plugin, MarkdownView } from "obsidian";

import { updateThat, getHover, getBacklinks } from "./state";
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
} from "./events";
import { checkFocusCursor, handleRemoveHoveredCursor } from "./utils";
import { ACTION_TYPE } from "./constants";

export default class ReferencePlugin extends Plugin {
	onload() {
		// that = this;
		setTimeout(() => {
			generateBacklinks();
		}, 4000);

		updateThat(this);

		this.registerEditorExtension([
			// emptyLineGutter,
			// placeholders,
			// editorChange,
			highlights,
			referenceResources,
			// highlightKeymap,
		]);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (ev) => {
				console.log("active-leaf-changed:");
				console.log(ev);
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

		this.registerDomEvent(document, "mousemove", async (evt) => {
			let span;
			let dataString;
			if (
				evt.target &&
				(evt.target instanceof HTMLSpanElement ||
					evt.target instanceof SVGElement ||
					evt.target instanceof SVGPathElement)
			) {
				// console.log("MOUSEMOVE");
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
				console.log("start hover reference effect");
				updateHoveredCursorColor(span);
				startReferenceEffect(span, ACTION_TYPE.MOUSE);
			} else if (
				span &&
				span instanceof HTMLSpanElement &&
				span.getAttribute("reference")
			) {
				console.log("start backlink effect");
				updateHoveredCursorColor(span);

				startBacklinkEffect(span);
			} else if (getHover() != null) {
				console.log("end hover reference effect");
				endReferenceHoverEffect();

				handleRemoveHoveredCursor(ACTION_TYPE.MOUSE);
			} else if (getBacklinks() != null) {
				console.log("end backlink reference effect");
				endBacklinkHoverEffect();
				handleRemoveHoveredCursor(ACTION_TYPE.BACKLINK);
			}
		});

		// on selection changes, event over click and keydown

		this.registerDomEvent(document, "click", async (evt) => {
			checkFocusCursor(evt);
			updateBacklinkMarkPositions();
		});

		this.registerDomEvent(document, "keyup", async (evt) => {
			console.log("keyup");
			checkFocusCursor(evt);
			updateBacklinkMarkPositions();
		});

		this.registerDomEvent(document, "keydown", async (evt) => {
			console.log("keydown");

			if (evt.key == "c" && evt.metaKey && evt.shiftKey) {
				console.log("c");
				updateClipboard();
			} else if (evt.key == "d" && evt.metaKey && evt.shiftKey) {
				console.log("d");
				updateClipboard(true);
			}
		});

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
