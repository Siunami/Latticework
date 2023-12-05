import { Plugin, MarkdownView } from "obsidian";

import { updateThat, state, getHover, getReferences } from "./state";
import { highlights, referenceResources } from "./widget";
import { updateClipboard } from "./clipboard";
import {
	generateReferences,
	addReferencesToLeaf,
	updateReferenceMarkPositions,
} from "./references";
import { checkCursorPositionAtDatastring, checkFocusCursor } from "./utils";
import { gutter, GutterMarker } from "@codemirror/view";
import { createReferenceIcon } from "./references";
import { SVG_HOVER_COLOR } from "./constants";

const emptyMarker = new (class extends GutterMarker {
	toDOM() {
		let { span, svg } = createReferenceIcon();
		span.addEventListener("mouseenter", (ev) => {
			svg.style.backgroundColor = SVG_HOVER_COLOR;
		});

		span.addEventListener("mouseleave", (ev) => {
			svg.style.backgroundColor = "white";
		});

		return span;
	}
})();

const emptyLineGutter = gutter({
	lineMarker(view, line) {
		console.log(view);
		console.log(line);
		// console.log(getReferences());

		return line.from == line.to ? emptyMarker : null;
	},
	initialSpacer: () => emptyMarker,
});

export default class ReferencePlugin extends Plugin {
	onload() {
		// that = this;
		setTimeout(() => {
			generateReferences();
		}, 4000);

		updateThat(this);

		this.registerEditorExtension([
			emptyLineGutter,
			// placeholders,
			highlights,
			referenceResources,
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
				// startReferenceEffect(span, "hover");
			} else if (
				span &&
				span instanceof HTMLSpanElement &&
				span.getAttribute("reference")
			) {
				console.log("start backlink effect");
				// this.startBacklinkEffect(span);
			} else if (getHover() != null) {
				console.log("end hover reference effect");
				// endReferenceHoverEffect();
			}
		});

		// on selection changes, event over click and keydown

		this.registerDomEvent(document, "click", async (evt) => {
			checkFocusCursor(evt);
		});

		this.registerDomEvent(document, "keydown", async (evt) => {
			updateReferenceMarkPositions();
			checkFocusCursor(evt);

			// const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			// if (activeView?.leaf != null) {
			// 	// addReferencesToLeaf(activeView.leaf);
			// }

			if (evt.key == "z" && evt.metaKey) {
				let { matched, span } = checkCursorPositionAtDatastring(evt);
				console.log(matched);
				console.log(span);
				// undo needs to undo any potential references created

				// if (matched) {
				// 	if (
				// 		state.values[2] != null &&
				// 		state.values[3] != null &&
				// 		state.values[2].dataString == state.values[3].dataString
				// 	) {
				// 		console.log("UNDO HOVER");
				// 		state = state.update({
				// 			effects: hoverEffect.of(
				// 				JSON.stringify({
				// 					type: "hover-off",
				// 				})
				// 			),
				// 		}).state;
				// 	}

				// 	console.log("UNDO CURSOR");
				// 	state = state.update({
				// 		effects: cursorEffect.of(
				// 			JSON.stringify({
				// 				type: "cursor-off",
				// 			})
				// 		),
				// 	}).state;
				// 	const activeView =
				// 		this.app.workspace.getActiveViewOfType(MarkdownView);
				// 	activeView?.editor.undo();
				// }
			} else {
				// Timeout fix: it doesn't recognize the latest paste change immediately because the paste event might not trigger the DOM change event.
				setTimeout(() => {
					checkFocusCursor(evt);
				}, 50);
			}

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
