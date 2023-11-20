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
				if (data.type == "hover-start") {
					return {};
				} else if (data.type == "hover") {
					if (value) return Object.assign(value, data);
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

		span.style.backgroundColor = "rgb(187, 215, 230)";
		span.style.color = "black";
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

		span.addEventListener("click", async () => {
			console.log("click");
			console.log(this);
			const { workspace } = state.values[0].app;
			const currLeaf = workspace.getLeaf();
			const rootSplit = findRootSplit(currLeaf);
			const leavesByTab = collectLeavesByTab(rootSplit);
			const { currTabIdx, index, dataString, leafId } = state.values[3];
			/* If temporary, then keep leaf */
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

				let targetLeaf = leavesByTab[currTabIdx][1][index];
				workspace.setActiveLeaf(targetLeaf);
				const editor = targetLeaf.view.editor;
				editor.scrollIntoView(
					{
						from: rangeStart,
						to: rangeEnd,
					},
					true
				);
				state = state.update({
					effects: hoverEffect.of(
						JSON.stringify({
							type: "hover",
							leafId: null,
						})
					),
				}).state;
			}
		});
		return span;
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

		// this.registerEvent(
		// 	this.app.workspace.on("editor-paste", async (e: ClipboardEvent) => {
		// 		state = state.update({
		// 			annotations: myAnnotation.of(this),
		// 		}).state;
		// 		const clipboardText = await navigator.clipboard.readText();
		// 		console.log(clipboardText);
		// 		// console.log(state);
		// 		// let copyData = state.values[2];
		// 		// console.log(copyData.text);
		// 		// if (clipboardText == copyData.text) {
		// 		// }
		// 	})
		// );

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

		this.registerDomEvent(document, "mousemove", async (evt) => {
			console.log(evt.target);
			let span;
			let dataString;
			if (
				evt.target &&
				(evt.target instanceof HTMLSpanElement ||
					evt.target instanceof SVGElement ||
					evt.target instanceof SVGPathElement)
			) {
				console.log("MOUSEMOVE");

				// If element is svg, find the containing parent span
				span = evt.target;

				while (
					!(span instanceof HTMLSpanElement) &&
					span.parentElement != null
				) {
					span = span.parentElement;
				}
				dataString = span.getAttribute("data");
			}

			if (dataString && span) {
				// Mutex, prevent concurrent access to following section of code
				if (state.values[3] != null) return;
				state = state.update({
					effects: hoverEffect.of(
						JSON.stringify({
							type: "hover-start",
						})
					),
				}).state;

				// data stored in span element
				let [text, file, from, to] = dataString.split("|");

				const currLeaf = this.app.workspace.getLeaf();

				const rootSplit = findRootSplit(currLeaf);
				let leavesByTab = collectLeavesByTab(rootSplit);
				console.log(leavesByTab.map((x: any) => x[1]));

				// Getting the current hovered tab
				let workspaceTab = span.closest(".workspace-tabs");
				let currTabIdx = leavesByTab.findIndex((x: any) => {
					return x[0].containerEl == workspaceTab;
				});

				let currTab = -1;
				if (span) {
					// THIS IS NOT STABLE
					const viewContent = span.closest(".view-content");
					if (!viewContent) return;
					const viewHeaderTitle = viewContent.querySelector(".inline-title");
					const currentFile = viewHeaderTitle?.innerHTML + ".md";

					currTab = leavesByTab[currTabIdx][1].findIndex((x: any) => {
						return x.getViewState().state.file == currentFile;
					});
				}

				let targetLeaf: any;

				// Mouseover
				if (currTabIdx != -1 && currTab != -1) {
					// Check adjacent tabs for file and open file if needed
					let rightAdjacentTab: any[] = [];
					let leftAdjacentTab: any[] = [];
					let adjacentTabs: any[] = [];

					if (leavesByTab[currTabIdx + 1]) {
						rightAdjacentTab = leavesByTab[currTabIdx + 1][1].map((leaf: any) =>
							leaf.getViewState()
						);
						adjacentTabs = [...adjacentTabs, ...rightAdjacentTab];
					}
					if (leavesByTab[currTabIdx - 1]) {
						leftAdjacentTab = leavesByTab[currTabIdx - 1][1].map((leaf: any) =>
							leaf.getViewState()
						);
						adjacentTabs = [...adjacentTabs, ...leftAdjacentTab];
					}
					let index = adjacentTabs.findIndex((x: any) => x.state.file == file);

					let adjacentTab;
					if (index == -1) {
						if (leavesByTab[currTabIdx + 1])
							adjacentTab = leavesByTab[currTabIdx + 1];
						else if (leavesByTab[currTabIdx - 1])
							adjacentTab = leavesByTab[currTabIdx - 1];

						if (adjacentTab) {
							let tab = adjacentTab[0];
							let newLeaf: any = this.app.workspace.createLeafInParent(tab, 0);
							state = state.update({
								effects: hoverEffect.of(
									JSON.stringify({
										type: "hover",
										leafId: newLeaf.id,
									})
								),
							}).state;
							let targetFile: any = this.app.vault.getAbstractFileByPath(file);
							await newLeaf.openFile(targetFile, { active: false });
						}
					}

					// IS THE ERROR IN NOT RELOADING THE LEAVESBYTAB ARRAY?
					// Because after creating a new tab, the leavesByTab array is not updated.
					// Does this break everything down the line?
					leavesByTab = collectLeavesByTab(rootSplit);

					let rangeStart = {
						line: parseInt(from.split(",")[0]),
						ch: parseInt(from.split(",")[1]),
					};
					let rangeEnd = {
						line: parseInt(to.split(",")[0]),
						ch: parseInt(to.split(",")[1]),
					};

					// highlight reference in the right tab
					if (leavesByTab[currTabIdx + 1]) {
						// console.log("There exists a tab to the right");
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
							// this.app.workspace.setActiveLeaf(targetLeaf);
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

					// highlight reference in the left tab
					if (leavesByTab[currTabIdx - 1]) {
						// console.log("There exists a tab to the left");
						let leftAdjacentTab = leavesByTab[currTabIdx - 1][1].map(
							(leaf: any) => leaf.getViewState()
						);
						// console.log(leftAdjacentTab);
						let index = leftAdjacentTab.findIndex(
							(x: any) => x.state.file == file
						);
						if (index != -1) {
							// console.log("perform replace action");

							targetLeaf = leavesByTab[currTabIdx - 1][1][index];
							// this.app.workspace.setActiveLeaf(targetLeaf);
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
				}
			} else if (state.values[3] != null) {
				// console.log(evt);
				const currLeaf = this.app.workspace.getLeaf();
				const rootSplit = findRootSplit(currLeaf);
				const leavesByTab = collectLeavesByTab(rootSplit);
				const { currTabIdx, index, dataString, leafId } = state.values[3];
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

					let targetLeaf = leavesByTab[currTabIdx][1][index];
					// this.app.workspace.setActiveLeaf(targetLeaf);
					const editor = targetLeaf.view.editor;
					const selection = await editor.replaceRange(
						text,
						rangeStart,
						Object.assign({}, rangeEnd, { ch: rangeEnd.ch + 6 })
					);

					if (leafId) {
						await targetLeaf.detach();
					} else {
						editor.scrollIntoView(
							{
								from: rangeStart,
								to: rangeEnd,
							},
							true
						);
					}
					state = state.update({
						effects: hoverEffect.of(
							JSON.stringify({
								type: "hover-off",
							})
						),
					}).state;
				}
			}
		});

		this.registerDomEvent(document, "keydown", async (evt) => {
			if (evt.key == "c" && evt.metaKey && evt.shiftKey) {
				console.log("c");
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);

				// Make sure the user is editing a Markdown file.
				if (view) {
					let selection = view.editor.getSelection();
					// selection = selection.split("\n").join(" ");

					if (view.file) {
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
					}
				}
			} else if (evt.key == "d" && evt.metaKey && evt.shiftKey) {
				console.log("d");
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);

				// Make sure the user is editing a Markdown file.
				if (view) {
					let selection = view.editor.getSelection();
					// selection = selection.split("\n").join(" ");

					if (view.file) {
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

						// Write the selected text to the clipboard
						await navigator.clipboard.writeText(
							`(((${selection}|${view.file.path}|${
								view.editor.getCursor("from").line +
								"," +
								view.editor.getCursor("from").ch
							}|${
								view.editor.getCursor("to").line +
								"," +
								view.editor.getCursor("to").ch
							})))`
						);
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
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
	}
}
