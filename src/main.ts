import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	MarkdownView,
	Editor,
	EditorRange,
	Menu,
	Notice,
	ItemView,
	WorkspaceLeaf,
	WorkspaceSplit,
	TFile,
} from "obsidian";

import {
	updateHover,
	updateThat,
	getThat,
	state,
	getReferences,
} from "./state";
import { highlights, referenceResources } from "./widget";
import { updateClipboard } from "./clipboard";
import { generateReferences } from "./references";
import { checkCursorPositionAtDatastring } from "./utils";

export default class ReferencePlugin extends Plugin {
	onload() {
		console.log("test");
		// that = this;
		setTimeout(() => {
			generateReferences();
		}, 4000);

		updateThat(this);

		this.registerEditorExtension([
			// emptyLineGutter,
			// placeholders,
			highlights,
			referenceResources,
		]);

		this.registerEvent(
			this.app.workspace.on("window-open", (ev) => {
				console.log("window opened:");
				console.log(ev);
			})
		);

		this.registerEvent(
			this.app.workspace.on("resize", () => {
				console.log("resize");
			})
		);

		this.registerEvent(
			this.app.workspace.on("file-open", (ev) => {
				console.log("file opened:");
				console.log(ev);
				console.log(getReferences());

				let currentLeaf: any = this.app.workspace.getLeaf();

				// check it references have already been created, else create references
			})
		);

		window.addEventListener("resize", () => {
			console.log("window resize");
		});

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				console.log("layout-changed:");
			})
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (ev) => {
				console.log("active-leaf-changed:");
				console.log(ev);
			})
		);

		this.registerEvent(
			this.app.workspace.on("window-close", (ev) => {
				console.log("window closed:");
				console.log(ev);
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-drop", (ev) => {
				console.log("Editor dropped:");
				console.log(ev);
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
				dataString &&
				span &&
				span instanceof HTMLSpanElement &&
				!span.className.includes("old-block")
			) {
				console.log("start hover reference effect");
				// this.startReferenceEffect(span, "hover");
			} else if (
				span &&
				span instanceof HTMLSpanElement &&
				span.getAttribute("reference")
			) {
				console.log("start reference reference effect");
				// this.startBacklinkEffect(span);
			} else if (state.values[2] != null) {
				console.log("end hover reference effect");
				// this.endReferenceHoverEffect();
			}
		});

		this.registerDomEvent(document, "click", async (evt) => {
			// this.checkFocusCursor(evt);
		});

		this.registerDomEvent(document, "keydown", async (evt) => {
			if (evt.key == "z" && evt.metaKey) {
				let { matched, span } = checkCursorPositionAtDatastring(evt);
				console.log(matched);
				console.log(span);

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
					// this.checkFocusCursor(evt);
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
	}

	onunload() {}
}
