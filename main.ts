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
} from "obsidian";

import {
	EditorView,
	WidgetType,
	Decoration,
	DecorationSet,
	ViewPlugin,
	ViewUpdate,
	MatchDecorator,
	gutter,
	GutterMarker,
} from "@codemirror/view";

import {
	EditorState,
	StateField,
	Annotation,
	StateEffect,
	Extension,
	RangeSetBuilder,
	Transaction,
} from "@codemirror/state";

import { syntaxTree } from "@codemirror/language";
import { constants } from "buffer";

/* State Fields */
type Link = {
	text: string;
	file: string;
	from: EditorRange;
	to: EditorRange;
};

let that = StateField.define<any>({
	create() {
		return null;
	},
	update(value, tr: any) {
		return tr["annotations"].length == 2 ? tr["annotations"][0].value : value;
	},
});

let links = StateField.define<Link[]>({
	create() {
		return [];
	},
	update(value, tr) {
		return [];
	},
});

let latestCopy = StateField.define<Link | null>({
	create() {
		return null;
	},
	update(value, tr) {
		// TODO: I think I need to check navigator clipboard and then update the state
		if (tr.effects.length > 0) {
			try {
				let data = JSON.parse(tr.effects[0].value);
				if (data.type == "copy") {
					console.log(data);
					return data;
				}
				return value;
			} catch (e) {
				console.log(e);
				return value;
			}
		}
		return value;
	},
});

let hoverElement = StateField.define<object | null>({
	create() {
		return null;
	},
	update(value, tr) {
		if (tr.effects.length > 0) {
			try {
				let data = JSON.parse(tr.effects[0].value);
				console.log(tr.effects[0].value);
				if (data.type == "hover") {
					return data;
				} else if (data.type == "hover-off") {
					return null;
				}
				return value;
			} catch (e) {
				console.log(e);
				return value;
			}
		}
		return value;
	},
});

let state: any = EditorState.create({
	extensions: [that, links, latestCopy, hoverElement],
});

const myAnnotation = Annotation.define<any>();
const copyEffect = StateEffect.define<string>();
const hoverEffect = StateEffect.define<string>();

/* GUTTER */
const emptyMarker = new (class extends GutterMarker {
	toDOM() {
		return document.createTextNode("ø");
	}
})();

const emptyLineGutter = gutter({
	lineMarker(view, line) {
		return line.from == line.to ? emptyMarker : null;
	},
	initialSpacer: () => emptyMarker,
});

/* WIDGET */
export class EmojiWidget extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		const div = document.createElement("span");

		div.innerText = "👉";

		return div;
	}
}

function findRootSplit(split: any) {
	// If this split has no parent, it's the root.
	if (!split.parent) {
		return split;
	}
	// Otherwise, keep looking upwards.
	return findRootSplit(split.parent);
}

// function collectLeavesByTab(split: any, result: any = {}) {
// 	if (split.type == "tabs") {
// 		console.log("tab");
// 		console.log(split);
// 		if (!(split.id in result)) {
// 			result[split.id] = {
// 				tab: split,
// 				leaves: [],
// 			};
// 		}
// 		collectLeavesByTab(split.children, result);
// 	} else if (split.type == "leaf") {
// 		const parentSplitId = split.parent.id;
// 		result[parentSplitId]["leaves"].push(split);
// 	}

// 	if (split.children) {
// 		for (const child of split.children) {
// 			collectLeavesByTab(child, result);
// 		}
// 	}
// 	// // Result is an object where each key is a tab, and the value is an array of leaves.
// 	// if (split.children) {
// 	// 	for (const child of split.children) {
// 	// 		if ("children" in child) {
// 	// 			// This child is a split, go deeper.
// 	// 			collectLeavesByTab(child, result);
// 	// 		} else {
// 	// 			console.log(child);
// 	// 			// This child is a leaf.
// 	// 			const tab = child.tab.id;
// 	// 			if (!(tab in result)) {
// 	// 				result[tab] = [];
// 	// 			}
// 	// 			result[tab].push(child);
// 	// 		}
// 	// 	}
// 	// }
// 	return result;
// }

function collectLeavesByTab(split: any, result: any = []) {
	if (split.type == "tabs") {
		result.push([split, []]);
		collectLeavesByTab(split.children, result);
	} else if (split.type == "leaf") {
		const parentSplitId = split.parent.id;
		// find array index for split with id parentSplitId
		let idx = result.findIndex((x: any) => x[0].id == parentSplitId);
		result[idx][1].push(split);
	}

	if (split.children) {
		for (const child of split.children) {
			collectLeavesByTab(child, result);
		}
	}
	return result;
}

class PlaceholderWidget extends WidgetType {
	constructor(private name: string, private view: EditorView) {
		super();
	}

	eq(other: PlaceholderWidget) {
		return this.name === other.name;
	}

	toDOM() {
		const span = document.createElement("span");
		// console.log(this);

		// span.style.border = "1px solid black";
		span.style.backgroundColor = "rgb(187, 215, 230)";
		span.style.color = "black";
		// span.style.padding = "3px";
		// span.style.width = 40 + this.name.length * 5 + "px";
		span.setAttribute("data", this.name);

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "16");
		svg.setAttribute("height", "16");
		svg.setAttribute("viewBox", "0 0 16 16");
		svg.setAttribute("fill", "none");
		svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("d", "M8 16L0 8L8 0L16 8L8 16Z");
		path.setAttribute("fill", "black");

		svg.appendChild(path);
		span.appendChild(svg);

		span.addEventListener("click", () => {
			console.log("click");
		});
		return span;

		if (!state.values[0].app) {
			// need to create a state transaction to get the "app"
		}

		let name = this.name;
		let [text, file, from, to] = name.split("|");

		if (!text || !file || !from || !to) return span;
		const rangeStart = {
			line: parseInt(from.split(",")[0]),
			ch: parseInt(from.split(",")[1]),
		};
		const rangeEnd = {
			line: parseInt(to.split(",")[0]),
			ch: parseInt(to.split(",")[1]),
		};

		let targetLeaf: any;

		span.addEventListener("mouseover", () => {
			console.log("MOUSEOVER");
			console.log(this);

			let { workspace, vault } = state.values[0].app;

			const activeLeaf = workspace.getLeaf();

			// I'm temporarily changing cursor focus to get the appropriate hovered leaf.
			const view = this.view;
			view.focus();

			const currLeaf = workspace.getLeaf();
			const currTab = currLeaf.parent;

			const rootSplit = findRootSplit(currLeaf.parent);
			const leavesByTab = collectLeavesByTab(rootSplit);
			const currTabIndex = leavesByTab.findIndex(
				(x: any) => x[0].id == currTab.id
			);
			console.log("Current tab index:", currTabIndex);

			// calculations done, return focus to original leaf
			activeLeaf.view.editor.focus();

			if (leavesByTab[currTabIndex + 1] && state.values[3] == null) {
				console.log("There exists a tab to the right");
				let rightAdjacentTab = leavesByTab[currTabIndex + 1][1].map(
					(leaf: any) => leaf.getViewState()
				);
				// console.log(rightAdjacentTab);
				let index = rightAdjacentTab.findIndex(
					(x: any) => x.state.file == file
				);
				// console.log(file);
				// console.log(exists);
				if (index != -1) {
					// console.log("perform replace action");

					targetLeaf = leavesByTab[currTabIndex + 1][1][index];
					workspace.setActiveLeaf(targetLeaf);
					state = state.update({
						effects: hoverEffect.of(
							JSON.stringify({
								type: "hover",
								currTab: currTabIndex + 1,
								index,
							})
						),
					}).state;

					const editor = targetLeaf.view.editor;
					editor.replaceRange(`+++${text}+++`, rangeStart, rangeEnd);
					editor.scrollIntoView(
						{
							from: rangeStart,
							to: rangeEnd,
						},
						true
					);
					return;
				}
			}

			if (leavesByTab[currTabIndex - 1] && state.values[3] == null) {
				console.log("There exists a tab to the left");
				let leftAdjacentTab = leavesByTab[currTabIndex - 1][1].map(
					(leaf: any) => leaf.getViewState()
				);
				// console.log(leftAdjacentTab);
				let index = leftAdjacentTab.findIndex((x: any) => x.state.file == file);
				// console.log(file);
				// console.log(exists);
				if (index != -1) {
					// console.log("perform replace action");
					targetLeaf = leavesByTab[currTabIndex - 1][1][index];
					workspace.setActiveLeaf(targetLeaf);
					state = state.update({
						effects: hoverEffect.of(
							JSON.stringify({
								type: "hover",
								currTab: currTabIndex - 1,
								index,
							})
						),
					}).state;

					const editor = targetLeaf.view.editor;
					editor.replaceRange(`+++${text}+++`, rangeStart, rangeEnd);
					editor.scrollIntoView(
						{
							from: rangeStart,
							to: rangeEnd,
						},
						true
					);

					return;
				}
			}

			// console.log("currLeaf");
			// console.log(currLeaf.getDisplayText());
			// console.log(currLeaf);

			// console.log("root leaves");
			// workspace.iterateRootLeaves((leaf: any) => {
			// 	// console.log(leaf.view);
			// 	console.log(leaf.getDisplayText());
			// 	// console.log(leaf.getEphemeralState());
			// 	console.log(leaf.getViewState());

			// 	let parentSplit = leaf.parent;
			// 	console.log(parentSplit);

			// 	let children = parentSplit.children;

			// 	if (parentSplit) {
			// 		console.log(
			// 			`Leaf with display "${leaf.getDisplayText()}" is part of a root split.`
			// 		);
			// 	} else {
			// 		console.log(
			// 			`Leaf with display "${leaf.getDisplayText()}" is not part of a recognized split.`
			// 		);
			// 	}
			// });

			// // console.log(workspace);
			// // console.log(vault.getMarkdownFiles());
			// let files = vault.getMarkdownFiles();
			// // console.log(files);
			// // TODO: I want to hover, show the ifo in the panel adjacent.
			// const view = workspace.getActiveViewOfType(MarkdownView);
			// const editor = view.editor;

			// // editor.setSelection(rangeStart, rangeEnd);
			// // editor.replaceSelection(`"${text}"`);

			// // const currLeaf = workspace.getLeaf();

			// // let leaf = workspace.createLeafBySplit(currLeaf);
			// // leaf.setViewState({ type: VIEW_TYPE_EXAMPLE, active: true });

			// const leaves = workspace.getLeavesOfType("markdown");
			// console.log(leaves);

			// editor.replaceRange(`%%%${text}%%%`, rangeStart, rangeEnd);
			// editor.scrollIntoView(
			// 	{
			// 		from: rangeStart,
			// 		to: rangeEnd,
			// 	},
			// 	true
			// );
		});

		span.addEventListener("mouseout", () => {
			let { workspace, vault } = state.values[0].app;

			console.log("MOUSEOUT");
			// console.log(targetLeaf);

			if (state.values[3]) {
				const currLeaf = workspace.getLeaf();
				const currTab = currLeaf.parent;

				const rootSplit = findRootSplit(currTab);
				const leavesByTab = collectLeavesByTab(rootSplit);

				let [currTabIdx, index] = state.values[3];
				let targetLeaf = leavesByTab[currTabIdx][1][index];
				workspace.setActiveLeaf(targetLeaf);
				state = state.update({
					effects: hoverEffect.of(
						JSON.stringify({
							type: "hover-off",
						})
					),
				}).state;

				const editor = targetLeaf.view.editor;

				const selection = editor.getRange(rangeStart, rangeEnd);
				console.log(selection);
				console.log(rangeEnd);
				editor.replaceRange(
					text,
					rangeStart,
					Object.assign({}, rangeEnd, { ch: rangeEnd.ch + 6 })
				);
			}

			// // console.log(workspace);
			// // console.log(vault.getMarkdownFiles());
			// let files = vault.getMarkdownFiles();
			// // console.log(files);
			// const view = workspace.getActiveViewOfType(MarkdownView);
			// const editor = view.editor;

			// state = state.update({
			// 	effects: hoverEffect.of(
			// 		JSON.stringify({
			// 			type: "hover-off",
			// 		})
			// 	),
			// }).state;

			// const editor = targetLeaf.view.editor;
			// console.log(targetLeaf);

			// editor.undo();
			// editor.scrollIntoView(
			// 	{
			// 		from: rangeStart,
			// 		to: rangeEnd,
			// 	},
			// 	true
			// );
		});

		span.addEventListener("click", () => {
			console.log("Clicked on placeholder: " + this.name);
			console.log(state);
			let { workspace, vault } = state.values[0].app;
			// console.log(workspace);
			// console.log(vault.getMarkdownFiles());
			let files = vault.getMarkdownFiles();
			// console.log(files);

			if (Object.keys(state).includes("values")) {
				const currLeaf = workspace.getLeaf();
				let targetFile = vault.getAbstractFileByPath(file);
				const newerLeaf = workspace.createLeafBySplit(currLeaf);
				newerLeaf
					.openFile(targetFile)
					.then(() => {
						console.log("successfully opened file");
						const view = workspace.getActiveViewOfType(MarkdownView);
						const editor = view.editor;

						// editor.setSelection(rangeStart, rangeEnd);
						// editor.replaceSelection("markdownImageTag");
						editor.scrollIntoView(
							{
								from: rangeStart,
								to: rangeEnd,
							},
							true
						);
					})
					.catch((err: any) => console.log(err));
			}
		});
	}
}

const placeholderDecoration = (match: RegExpExecArray, view: EditorView) =>
	Decoration.replace({
		widget: new PlaceholderWidget(match[1], view),
	});

const placeholderMatcher = new MatchDecorator({
	// regexp: /\(\((\w+)\)\)/g,
	regexp: /\(\(\(([\s\S]*?)\)\)\)/g,
	// regexp: /\(\(([^|)]+)\|([^|)]+)\|([^|)]+)\|([^|)]+)\)\)/g,
	// regexp: /\(\(([^-*]+)-\*-([^-*]+)-\*-([^-*]+)-\*-([^-*]+)\)\)/g,
	decoration: (match, view, pos) => {
		return placeholderDecoration(match, view);
	},
});

const placeholders = ViewPlugin.fromClass(
	class {
		placeholders: DecorationSet;
		constructor(view: EditorView) {
			this.placeholders = placeholderMatcher.createDeco(view);
		}
		update(update: ViewUpdate) {
			this.placeholders = placeholderMatcher.updateDeco(
				update,
				this.placeholders
			);
		}
		destroy() {
			this.placeholders = Decoration.none;
		}
	},
	{
		decorations: (instance) => instance.placeholders,
		provide: (plugin) =>
			EditorView.atomicRanges.of((view) => {
				return view.plugin(plugin)?.placeholders || Decoration.none;
			}),
	}
);

/* highlight */

class HighlighterWidget extends WidgetType {
	constructor(private name: string, private view: EditorView) {
		super();
	}

	eq(other: HighlighterWidget) {
		return this.name === other.name;
	}

	toDOM() {
		const span = document.createElement("fragment");
		// console.log(this);
		span.textContent = this.name;
		span.style.backgroundColor = "rgb(187, 215, 230)";
		span.style.color = "black";

		return span;
	}
}

const highlighterDecoration = (match: RegExpExecArray, view: EditorView) =>
	Decoration.replace({
		widget: new HighlighterWidget(match[1], view),
	});

const highlightMatcher = new MatchDecorator({
	// regexp: /\(\((\w+)\)\)/g,
	regexp: /\+\+\+(.*?)\+\+\+/g,
	// regexp: /\(\(([^|)]+)\|([^|)]+)\|([^|)]+)\|([^|)]+)\)\)/g,
	// regexp: /\(\(([^-*]+)-\*-([^-*]+)-\*-([^-*]+)-\*-([^-*]+)\)\)/g,
	decoration: (match, view, pos) => {
		return highlighterDecoration(match, view);
	},
});

const highlights = ViewPlugin.fromClass(
	class {
		highlights: DecorationSet;
		constructor(view: EditorView) {
			this.highlights = highlightMatcher.createDeco(view);
		}
		update(update: ViewUpdate) {
			this.highlights = highlightMatcher.updateDeco(update, this.highlights);
		}
		destroy() {
			this.highlights = Decoration.none;
		}
	},
	{
		decorations: (instance) => instance.highlights,
		provide: (plugin) =>
			EditorView.atomicRanges.of((view) => {
				return view.plugin(plugin)?.highlights || Decoration.none;
			}),
	}
);

/* Emoji plugin settings */

export const emojiListField = StateField.define<DecorationSet>({
	create(state): DecorationSet {
		return Decoration.none;
	},
	update(oldState: DecorationSet, transaction: Transaction): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();

		syntaxTree(transaction.state).iterate({
			enter(node) {
				if (node.type.name.startsWith("list")) {
					// Position of the '-' or the '*'.
					const listCharFrom = node.from - 2;

					builder.add(
						listCharFrom,
						listCharFrom + 1,
						Decoration.replace({
							widget: new EmojiWidget(),
						})
					);
				}
			},
		});

		return builder.finish();
	},
	provide(field: StateField<DecorationSet>): Extension {
		return EditorView.decorations.from(field);
	},
});

/* Exmample View */
export const VIEW_TYPE_EXAMPLE = "example-view";

// A simple Javascript function that converts a line of markdown text
// to HTML using a createEl() function, as described in the documentation.
function markdownToHtml(containerEl: any, markdownLine: string) {
	// Define regex patterns for markdown
	const headingPattern = /^(#{1,6})\s(.*)/;
	const boldPattern = /\*\*(.*?)\*\*/g;
	const italicPattern = /\*(.*?)\*/g;
	const linkPattern = /\[([^\[]+)\]\(([^\)]+)\)/g;

	// Identify Markdown Heading and create the corresponding HTML element
	const headingMatch = markdownLine.match(headingPattern);
	if (headingMatch) {
		// Heading level is determined by the number of '#' characters
		const headingLevel = headingMatch[1].length;
		// Add an HTML heading element with the correct level and text content
		containerEl.createEl(`h${headingLevel}`, { text: headingMatch[2] });
		return;
	}

	// If not a heading, create a paragraph element
	const paragraphEl = containerEl.createEl("div");

	// Replace markdown entities with HTML in paragraph content
	markdownLine = markdownLine
		.replace(boldPattern, "<strong>$1</strong>")
		.replace(italicPattern, "<em>$1</em>")
		.replace(linkPattern, '<a href="$2">$1</a>');

	// Set innerHTML of paragraph element with replaced markdown content
	paragraphEl.innerHTML = markdownLine;
}

export class ExampleView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_EXAMPLE;
	}

	getDisplayText() {
		let name = state.values[3];
		console.log(name);
		let [text, file, from, to] = name.split("|");
		return file;
	}

	async onOpen() {
		console.log("Example view");
		const { workspace, vault } = state.values[0].app;
		let files = vault.getMarkdownFiles();

		let name = state.values[3];
		let [text, file, from, to] = name.split("|");
		console.log(name);
		// filter for file with name file
		let fileObj = files.filter((f: any) => f.name == file)[0];
		let contents = await vault.read(fileObj);
		console.log(file.split("\n"));

		const container = this.containerEl.children[1];
		container.empty();
		container.createEl("h1", { text: file.split(".")[0] });

		let lines = contents.split("\n");
		console.log(lines);
		for (let line of lines) {
			if (line.trim() == "") container.createEl("br");
			else markdownToHtml(container, line);
		}
	}

	async onClose() {
		// Nothing to clean up.
	}
}

/* Highlight plugin settings */

interface MyHighlightPluginSettings {
	highlightClass: string;
}

const DEFAULT_SETTINGS: MyHighlightPluginSettings = {
	highlightClass: "my-custom-highlight",
};

class MyHighlightPluginSettingTab extends PluginSettingTab {
	plugin: MyHighlightPlugin;

	constructor(app: App, plugin: MyHighlightPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Highlight Class")
			.setDesc("CSS class to apply for highlighting")
			.addText((text) =>
				text
					.setPlaceholder("Enter CSS class")
					.setValue(this.plugin.settings.highlightClass)
					.onChange(async (value) => {
						this.plugin.settings.highlightClass = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

// Function to create and return an SVG element with a circle
function createSvgCircle() {
	// Create an SVG namespace, which is required for creating SVG elements
	const SVG_NS = "http://www.w3.org/2000/svg";

	// Create the SVG element
	const svgElem = document.createElementNS(SVG_NS, "svg");
	svgElem.setAttribute("width", "100");
	svgElem.setAttribute("height", "100");
	svgElem.setAttribute("viewBox", "0 0 100 100");

	// Create a circle element within the SVG
	const circleElem = document.createElementNS(SVG_NS, "circle");
	circleElem.setAttribute("cx", "50");
	circleElem.setAttribute("cy", "50");
	circleElem.setAttribute("r", "40"); // Radius of the circle
	circleElem.setAttribute("fill", "red"); // Fill color of the circle

	// Append the circle to the SVG element
	svgElem.appendChild(circleElem);

	return svgElem; // Return the complete SVG element with the circle inside
}

export default class MyHighlightPlugin extends Plugin {
	settings: MyHighlightPluginSettings;

	// This function would save the SVG as a file and return the path.
	async saveSvgAsFile(svgContent: string, filename: string): Promise<string> {
		const fileUri = `./links/${filename}.svg`;
		// Make sure to handle path creation and check if a file already exists if needed.

		await this.app.vault.adapter.write(fileUri, svgContent);

		return fileUri;
	}

	async onload() {
		await this.loadSettings();

		// that = this;

		state = state.update({
			annotations: myAnnotation.of(this),
		}).state;

		this.addRibbonIcon("dice", "Activate view", () => {
			this.activateView();
		});

		this.registerEvent(
			this.app.workspace.on("editor-paste", async (e: ClipboardEvent) => {
				state = state.update({
					annotations: myAnnotation.of(this),
				}).state;
				const clipboardText = await navigator.clipboard.readText();
				console.log(clipboardText);
				// console.log(state);
				// let copyData = state.values[2];
				// console.log(copyData.text);
				// if (clipboardText == copyData.text) {
				// }
			})
		);

		// state = state.update({ changes: { from: 0, insert: "." } }).state;

		// console.log(this);

		// this.registerEditorSuggest((editor: any) => {
		// 	console.log(editor);
		// });

		this.registerEditorExtension([
			// emptyLineGutter,
			placeholders,
			// emojiListField,
			highlights,
		]);

		this.registerView(VIEW_TYPE_EXAMPLE, (leaf) => new ExampleView(leaf));

		this.registerDomEvent(document, "mouseover", (evt) =>
			this.onMouseOverLink(evt)
		);

		this.registerDomEvent(document, "click", (evt) =>
			this.onMouseClickLink(evt)
		);

		this.registerDomEvent(document, "mousemove", (evt) => {
			if (
				evt.target &&
				(evt.target instanceof HTMLSpanElement ||
					evt.target instanceof SVGElement ||
					evt.target instanceof SVGPathElement)
			) {
				let span = evt.target;

				while (
					!(span instanceof HTMLSpanElement) &&
					span.parentElement != null
				) {
					span = span.parentElement;
				}

				let dataString = span.getAttribute("data");

				if (dataString) {
					let [text, file, from, to] = dataString.split("|");

					let rangeStart = {
						line: parseInt(from.split(",")[0]),
						ch: parseInt(from.split(",")[1]),
					};
					let rangeEnd = {
						line: parseInt(to.split(",")[0]),
						ch: parseInt(to.split(",")[1]),
					};

					const currLeaf = this.app.workspace.getLeaf();

					const rootSplit = findRootSplit(currLeaf);
					const leavesByTab = collectLeavesByTab(rootSplit);

					// Getting the current hovered tab
					let workspaceTab = span.closest(".workspace-tabs");
					let currTabIdx = leavesByTab.findIndex((x: any) => {
						return x[0].containerEl == workspaceTab;
					});
					let currTab = leavesByTab[currTabIdx][1].findIndex((x: any) => {
						return x.getViewState().state.file == file;
					});

					let targetLeaf: any;

					// Mouseover
					if (currTabIdx != -1 && currTab != -1 && state.values[3] == null) {
						// state = state.update({
						// 	effects: hoverEffect.of(
						// 		JSON.stringify({
						// 			type: "hover",
						// 			currTabIdx: currTabIdx,
						// 			index: currTab,
						// 			dataString,
						// 		})
						// 	),
						// }).state;
						console.log("hello, only once");

						if (leavesByTab[currTabIdx + 1]) {
							console.log("There exists a tab to the right");
							let rightAdjacentTab = leavesByTab[currTabIdx + 1][1].map(
								(leaf: any) => leaf.getViewState()
							);
							// console.log(rightAdjacentTab);
							let index = rightAdjacentTab.findIndex(
								(x: any) => x.state.file == file
							);
							if (index != -1) {
								// console.log("perform replace action");

								targetLeaf = leavesByTab[currTabIdx + 1][1][index];
								this.app.workspace.setActiveLeaf(targetLeaf);
								state = state.update({
									effects: hoverEffect.of(
										JSON.stringify({
											type: "hover",
											currTabIdx: currTabIdx + 1,
											index,
											dataString,
										})
									),
								}).state;

								const editor = targetLeaf.view.editor;
								editor.replaceRange(`+++${text}+++`, rangeStart, rangeEnd);
								editor.scrollIntoView(
									{
										from: rangeStart,
										to: rangeEnd,
									},
									true
								);
								return;
							}
						}

						if (leavesByTab[currTabIdx - 1]) {
							console.log("There exists a tab to the right");
							let rightAdjacentTab = leavesByTab[currTabIdx - 1][1].map(
								(leaf: any) => leaf.getViewState()
							);
							// console.log(rightAdjacentTab);
							let index = rightAdjacentTab.findIndex(
								(x: any) => x.state.file == file
							);
							if (index != -1) {
								// console.log("perform replace action");

								targetLeaf = leavesByTab[currTabIdx - 1][1][index];
								this.app.workspace.setActiveLeaf(targetLeaf);
								state = state.update({
									effects: hoverEffect.of(
										JSON.stringify({
											type: "hover",
											currTabIdx: currTabIdx - 1,
											index,
											dataString,
										})
									),
								}).state;

								const editor = targetLeaf.view.editor;
								editor.replaceRange(`+++${text}+++`, rangeStart, rangeEnd);
								editor.scrollIntoView(
									{
										from: rangeStart,
										to: rangeEnd,
									},
									true
								);
								return;
							}
						}

						if (leavesByTab[currTabIdx + 1]) {
							let tab = leavesByTab[currTabIdx + 1][0];
							let numberTabs = leavesByTab[currTabIdx + 1][1].length - 1;
							let newTab: any = this.app.workspace.createLeafInParent(
								tab,
								numberTabs
							);
							let targetFile: any = this.app.vault.getAbstractFileByPath(file);
							newTab
								.openFile(targetFile)
								.then(() => {
									const editor = newTab.view.editor;
									console.log(newTab);
									state = state.update({
										effects: hoverEffect.of(
											JSON.stringify({
												type: "hover",
												currTabIdx: currTabIdx + 1,
												index: numberTabs,
												dataString,
											})
										),
									}).state;
									// editor.setSelection(rangeStart, rangeEnd);
									// editor.replaceSelection("markdownImageTag");
									editor.replaceRange(`+++${text}+++`, rangeStart, rangeEnd);
									editor.scrollIntoView(
										{
											from: rangeStart,
											to: rangeEnd,
										},
										true
									);
								})
								.catch((err: any) => console.log(err));
						}
					}

					// const activeLeaf = this.app.workspace.getLeaf();

					// console.log(activeLeaf);

					// // I'm temporarily changing cursor focus to get the appropriate hovered leaf.
					// const view: any = activeLeaf.view;
					// view.editor.focus();

					// const currLeaf = workspace.getLeaf();
					// const currTab = currLeaf.parent;
				}
			} else if (state.values[3] != null) {
				// console.log(evt);

				const currLeaf = this.app.workspace.getLeaf();

				const rootSplit = findRootSplit(currLeaf);
				const leavesByTab = collectLeavesByTab(rootSplit);

				const { currTabIdx, index, dataString } = state.values[3];
				let [text, file, from, to] = dataString.split("|");

				let rangeStart = {
					line: parseInt(from.split(",")[0]),
					ch: parseInt(from.split(",")[1]),
				};
				let rangeEnd = {
					line: parseInt(to.split(",")[0]),
					ch: parseInt(to.split(",")[1]),
				};

				let targetLeaf = leavesByTab[currTabIdx][1][index];
				this.app.workspace.setActiveLeaf(targetLeaf);
				state = state.update({
					effects: hoverEffect.of(
						JSON.stringify({
							type: "hover-off",
						})
					),
				}).state;

				const editor = targetLeaf.view.editor;
				editor.replaceRange(
					text,
					rangeStart,
					Object.assign({}, rangeEnd, { ch: rangeEnd.ch + 6 })
				);
			}
		});

		this.registerDomEvent(document, "keydown", async (evt) => {
			if (evt.key == "c" && evt.metaKey && evt.shiftKey) {
				console.log("c");
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);

				// Make sure the user is editing a Markdown file.
				if (view) {
					let selection = view.editor.getSelection();
					console.log(selection);

					selection = selection.split("\n").join(" ");

					if (view.file) {
						// console.log(state);
						state = state.update({
							effects: copyEffect.of(
								JSON.stringify({
									type: "copy",
									text: selection,
									file: view.file.path,
									from: view.editor.getCursor("from"),
									to: view.editor.getCursor("to"),
								})
							),
						}).state;
						// console.log(state);

						// Write the selected text to the clipboard
						await navigator.clipboard.writeText(
							selection +
								` (((${selection}|${view.file.path}|${
									view.editor.getCursor("from").line +
									"," +
									view.editor.getCursor("from").ch
								}|${
									view.editor.getCursor("to").line +
									"," +
									view.editor.getCursor("to").ch
								})))`
						);

						// await navigator.clipboard.writeText(
						// 	selection +
						// 		` ((${selection}-*-${view.file.path}-*-${
						// 			view.editor.getCursor("from").line +
						// 			"," +
						// 			view.editor.getCursor("from").ch
						// 		}-*-${
						// 			view.editor.getCursor("to").line +
						// 			"," +
						// 			view.editor.getCursor("to").ch
						// 		}))`
						// );
					}
				}
			}
		});

		this.registerEvent(
			this.app.workspace.on("file-open", this.onFileOpenOrSwitch.bind(this))
		);
		// this.registerEvent(
		// 	this.app.workspace.on("file-switch", this.onFileOpenOrSwitch.bind(this))
		// );

		this.registerMarkdownPostProcessor((element, context) => {
			const codeblocks = element.findAll("code");

			for (let codeblock of codeblocks) {
				// console.log(codeblock);
			}
		});

		this.addRibbonIcon("dice", "Open menu", (event) => {
			const menu = new Menu();

			menu.addItem((item) =>
				item
					.setTitle("Copy")
					.setIcon("documents")
					.onClick(() => {
						new Notice("Copied");
					})
			);

			menu.addItem((item) =>
				item
					.setTitle("Paste")
					.setIcon("paste")
					.onClick(() => {
						new Notice("Pasted");
					})
			);

			menu.showAtMouseEvent(event);
		});

		// this.registerEditorSuggest()

		this.addCommand({
			id: "highlight-text",
			name: "Highlight Selected Text",
			hotkeys: [
				{
					modifiers: ["Mod", "Shift"],
					key: "h",
				},
			],
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.highlightSelectedText(editor, view);
			},
		});

		this.addSettingTab(new MyHighlightPluginSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		let { workspace, vault } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		let leaves = workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			const currLeaf = workspace.getLeaf();

			let leaf = workspace.createLeafBySplit(currLeaf);
			await leaf.setViewState({ type: VIEW_TYPE_EXAMPLE, active: true });
			console.log(leaf);
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		if (leaf) workspace.revealLeaf(leaf);
	}

	async onMouseOverLink(evt: MouseEvent) {
		const target: EventTarget | null = evt.target;
		if (target instanceof HTMLImageElement && target.alt) {
			// Mouse is over an image
			const altText = target.alt;
			// Do something with the alt text

			// let bbox = target.getBoundingClientRect();

			// const myElement = target.containerEl.createElement("div");
			// myElement.textContent = "Hello, world!";
		}

		// if (target && target.tagName === "A") {
		// 	// Mouse is over a link
		// 	const href = target.getAttribute("href");
		// 	// Do something with the href
		// 	console.log("Mouse over link:", href);
		// }
	}

	async onMouseClickLink(evt: MouseEvent) {
		const target: EventTarget | null = evt.target;

		if (target instanceof HTMLImageElement && target.alt) {
			// console.log("CLICK: " + target.alt);

			let { workspace } = this.app;

			let leaves = workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE);
			// console.log(leaves);

			let leaf = workspace.getRightLeaf(false);

			// this.app.workspace.iterateAllLeaves((leaf) => {
			// 	console.log(leaf);
			// 	console.log(leaf.getViewState().type);
			// });
			await leaf.setViewState({ type: VIEW_TYPE_EXAMPLE, active: true });

			const activeView = workspace.getActiveViewOfType(MarkdownView);

			// console.log(activeView);

			const currLeaf = workspace.getLeaf();

			// console.log(currLeaf);

			const newLeaf = workspace.createLeafBySplit(currLeaf, "vertical");
			// console.log(newLeaf);

			// workspace.createLeafInParent(currLeaf, 0);

			// // Get the current active view
			// const activeView = this.app.workspace.getActiveViewOfType(WorkspaceView);

			// console.log(activeView);

			// // If there is an active view
			// if (activeView) {
			// 	// Create a new leaf and split it to the right of the active view's leaf
			// 	const newLeaf = this.app.workspace.getLeaf(activeView);
			// 	newLeaf.split(WorkspaceSplit.Right);

			// 	// Focus on the new leaf
			// 	this.app.workspace.setActiveLeaf(newLeaf);
			// } else {
			// 	// Otherwise, create a new empty leaf to the right
			// 	const newLeaf = this.app.workspace.createLeafBySplit(
			// 		activeView,
			// 		"horizontal"
			// 	);

			// 	// Focus on the new leaf
			// 	this.app.workspace.setActiveLeaf(newLeaf);
			// }
		}
	}

	onFileOpenOrSwitch() {
		// console.log("file open");
		// console.log(this);
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);

		// console.log(activeLeaf);
		// // Check if the active leaf has a CodeMirror editor instance
		// if (activeLeaf && activeLeaf.view instanceof Editor) {
		// 	this.cm = activeLeaf.view.editor;
		// 	console.log(this.cm); // The CodeMirror instance is available here

		// 	// You can perform further actions with the CodeMirror instance
		// } else {
		// 	this.cm = null;
		// }
	}

	async highlightSelectedText(editor: Editor, view: MarkdownView) {
		const selectedText = editor.getSelection();
		if (selectedText.length === 0) return;

		const decoration = Decoration.replace({
			widget: new EmojiWidget(),
		});

		console.log(new EmojiWidget());
		console.log(decoration);

		// editor.replaceSelection(.innerText);

		return;

		// Get the SVG content
		const svgContent = createSvgCircle().outerHTML;
		console.log(createSvgCircle());

		// Save the SVG to a file and get the file's path
		const svgFilePath = await this.saveSvgAsFile(
			svgContent,
			"unique-circle-filename"
		);

		// Convert the file path to a markdown image tag
		const markdownImageTag = `![](${svgFilePath})`;

		// Insert the markdown image tag at the current cursor position
		editor.replaceSelection(markdownImageTag);

		// const svgDataUri =
		// 	"data:image/svg+xml," + encodeURIComponent(createSvgCircle().outerHTML);
		// const markdownImageTag = `![](${svgDataUri})`;

		// // Insert the markdown image tag at the current cursor position
		// editor.replaceSelection(markdownImageTag);

		// const highlightMarkdown = `<mark class="${this.settings.highlightClass}">${selectedText}</mark>`;
		// editor.replaceSelection(highlightMarkdown);
	}
}
