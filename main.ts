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
					console.log(Object.assign({}, data));
					return Object.assign({}, data);
				} else if (data.type == "hover") {
					if (value) console.log(Object.assign(value, data));
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

let cursorElement = StateField.define<object | null>({
	create() {
		return null;
	},
	update(value, tr) {
		if (tr.effects.length > 0) {
			try {
				let data = JSON.parse(tr.effects[0].value);
				// console.log(tr.effects[0].value);
				if (data.type == "cursor-start") {
					return {};
				} else if (data.type == "cursor") {
					if (value) return Object.assign(value, data);
					return data;
				} else if (data.type == "cursor-off") {
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
	extensions: [that, links, hoverElement, cursorElement],
});

const myAnnotation = Annotation.define<any>();
const hoverEffect = StateEffect.define<string>();
const cursorEffect = StateEffect.define<string>();

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

/* UTILS */

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

function collectLeavesByTabHelper() {
	const { workspace } = state.values[0].app;
	const currLeaf = workspace.getLeaf();
	const rootSplit = findRootSplit(currLeaf);
	return collectLeavesByTab(rootSplit);
}

function getHoveredTab(leavesByTab: any[], span: HTMLSpanElement) {
	const viewContent = span.closest(".view-content");
	if (!viewContent) return;
	const viewHeaderTitle = viewContent.querySelector(".inline-title");
	const currentFile = viewHeaderTitle?.innerHTML + ".md";
	const leaves = leavesByTab.map((el) => el[1]).flat();
	const currTab = leaves.findIndex((x: any) => {
		return x.getViewState().state.file == currentFile;
	});
	return leaves[currTab];
}

function parseEditorPosition(positionString: string) {
	let [line, ch] = positionString.split(",");
	return { line: parseInt(line), ch: parseInt(ch) };
}

function getCurrentTabIndex(leavesByTab: any[], span: HTMLSpanElement) {
	let workspaceTab = span.closest(".workspace-tabs");
	let currTabIdx = leavesByTab.findIndex((x: any) => {
		return x[0].containerEl == workspaceTab;
	});
	return currTabIdx;
}

function getAdjacentTabs(leavesByTab: any[], currTabIdx: number, file: string) {
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
	return { adjacentTabs, index };
}

async function openFileInAdjacentTab(
	leavesByTab: any[],
	currTabIdx: number,
	file: string
) {
	let { adjacentTabs, index } = getAdjacentTabs(leavesByTab, currTabIdx, file);

	// there are no adjacent tabs
	if (adjacentTabs.length == 0) {
		const { workspace } = state.values[0].app;
		const currLeaf = workspace.getLeaf();
		let newLeaf = workspace.createLeafBySplit(currLeaf);
		await openFileInLeaf(newLeaf, file);
		return newLeaf;
	} else if (index == -1) {
		// leaf doesn't exist in either adjacent tab
		let adjacentTab;
		if (leavesByTab[currTabIdx + 1]) adjacentTab = leavesByTab[currTabIdx + 1];
		else if (leavesByTab[currTabIdx - 1])
			adjacentTab = leavesByTab[currTabIdx - 1];

		if (adjacentTab) {
			let tab = adjacentTab[0];
			let newLeaf: any = this.app.workspace.createLeafInParent(tab, 0);
			await openFileInLeaf(newLeaf, file);
			return newLeaf;
		}
	}
	return null;
}

async function openFileInLeaf(newLeaf: any, file: string) {
	let targetFile: any = this.app.vault.getAbstractFileByPath(file);
	await newLeaf.openFile(targetFile, { active: false });
}

function highlightHoveredText(dataString: string, tabIdx: number) {
	let [text, file, from, to] = dataString.split("|");

	let rangeStart = parseEditorPosition(from);
	let rangeEnd = parseEditorPosition(to);
	const leavesByTab = collectLeavesByTabHelper();
	let rightAdjacentTab = leavesByTab[tabIdx][1].map((leaf: any) =>
		leaf.getViewState()
	);
	let index = rightAdjacentTab.findIndex((x: any) => x.state.file == file);
	if (index != -1) {
		let targetLeaf = leavesByTab[tabIdx][1][index];
		// this.app.workspace.setActiveLeaf(targetLeaf);

		const editor = targetLeaf.view.editor;
		/*
		{
			"top": 0,
			"left": 0,
			"clientHeight": 1311,
			"clientWidth": 1063,
			"height": 1311,
			"width": 1078
		}
		*/
		const originalScroll = editor.getScrollInfo();
		const originalCursor = editor.getCursor();

		editor.replaceRange(`+++${text}+++`, rangeStart, rangeEnd);
		editor.scrollIntoView(
			{
				from: rangeStart,
				to: rangeEnd,
			},
			true
		);
		return {
			tabIdx: tabIdx,
			index,
			dataString,
			originalTop: originalScroll.top,
			originalCursor,
		};
	}
	return null;
}

async function updateClipboard(only: boolean = false) {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);

	// Make sure the user is editing a Markdown file.
	if (view) {
		let selection = view.editor.getSelection();
		// selection = selection.split("\n").join(" ");

		if (view.file) {
			let reference = `(((${selection}|${view.file.path}|${
				view.editor.getCursor("from").line +
				"," +
				view.editor.getCursor("from").ch
			}|${
				view.editor.getCursor("to").line + "," + view.editor.getCursor("to").ch
			})))`;

			if (!only) {
				reference = '"' + selection + '" ' + reference;
			}

			// Write the selected text to the clipboard
			await navigator.clipboard.writeText(reference);
		}
	}
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
			const leavesByTab = collectLeavesByTabHelper();

			const { tabIdx, index, dataString, leafId } = state.values[2];
			/* If temporary, then keep leaf */
			if (dataString) {
				let [text, file, from, to] = dataString.split("|");
				let rangeEnd = parseEditorPosition(to);
				/*
					The problem here is that I don't have the position of the span element.
					I want to set the active cursor to the end of the span
				*/

				let [text2, file2, from2, to2] = this.name.split("|");
				const currentTab = getHoveredTab(leavesByTab, span);
				console.log("currentTab");
				console.log(currentTab);
				let rangeEnd2 = parseEditorPosition(to2);

				const lineText = currentTab?.view?.editor.getLine(rangeEnd2.line);
				console.log(lineText);
				// currentTab.view.editor.setCursor(rangeEnd2);

				let targetLeaf = leavesByTab[tabIdx][1][index];
				workspace.setActiveLeaf(targetLeaf);
				const editor = targetLeaf.view.editor;
				editor.setCursor(rangeEnd);
				state = state.update({
					effects: hoverEffect.of(
						JSON.stringify({
							type: "hover",
							leafId: null,
							originalTop: null,
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
		console.log(pos);
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

	async startCursorEffect(dataString: string, span: HTMLSpanElement) {
		// Mutex, prevent concurrent access to following section of code
		if (state.values[3] != null) return;
		state = state.update({
			effects: cursorEffect.of(
				JSON.stringify({
					type: "cursor-start",
				})
			),
		}).state;

		if (state.values[2] != null && state.values[2].dataString == dataString) {
			const data = state.values[2];
			state = state.update({
				effects: cursorEffect.of(
					JSON.stringify(Object.assign(data, { type: "cursor" }))
				),
			}).state;
			return;
		}

		// data stored in span element
		let [text, file, from, to] = dataString.split("|");

		let leavesByTab = collectLeavesByTabHelper();
		let currTabIdx = getCurrentTabIndex(leavesByTab, span);
		if (currTabIdx != -1) {
			const newLeaf = await openFileInAdjacentTab(
				leavesByTab,
				currTabIdx,
				file
			);
			if (newLeaf) {
				state = state.update({
					effects: cursorEffect.of(
						JSON.stringify({
							type: "cursor",
							leafId: newLeaf.id,
						})
					),
				}).state;
			}

			leavesByTab = collectLeavesByTabHelper();
			// highlight reference in the right tab
			if (leavesByTab[currTabIdx + 1]) {
				const data = highlightHoveredText(dataString, currTabIdx + 1);
				if (data) {
					state = state.update({
						effects: cursorEffect.of(
							JSON.stringify(Object.assign(data, { type: "cursor" }))
						),
					}).state;
				}
				return;
			}

			// highlight reference in the left tab
			if (leavesByTab[currTabIdx - 1]) {
				const data = highlightHoveredText(dataString, currTabIdx - 1);
				if (data) {
					state = state.update({
						effects: cursorEffect.of(
							JSON.stringify(Object.assign(data, { type: "cursor" }))
						),
					}).state;
				}
				return;
			}
		}
	}

	async endCursorEffect() {
		const leavesByTab = collectLeavesByTabHelper();
		if (!state.values[3]) return;

		const { tabIdx, index, dataString, leafId, originalTop, originalCursor } =
			state.values[3];
		if (state.values[2] != null && state.values[2].dataString == dataString) {
			// End mutex lock
			state = state.update({
				effects: cursorEffect.of(
					JSON.stringify({
						type: "cursor-off",
					})
				),
			}).state;
			return;
		}

		if (dataString) {
			let [text, file, from, to] = dataString.split("|");
			let rangeStart = parseEditorPosition(from);
			let rangeEnd = parseEditorPosition(to);

			let targetLeaf = leavesByTab[tabIdx][1][index];
			// this.app.workspace.setActiveLeaf(targetLeaf);
			const editor = targetLeaf.view.editor;

			editor.replaceRange(
				text,
				rangeStart,
				Object.assign({}, rangeEnd, { ch: rangeEnd.ch + 6 })
			);
			editor.scrollIntoView(
				{
					from: rangeStart,
					to: rangeEnd,
				},
				true
			);
			// console.log(selection);

			console.log("originalTop: " + originalTop);
			if (leafId) {
				await targetLeaf.detach();
			}
		}
		// End mutex lock
		state = state.update({
			effects: cursorEffect.of(
				JSON.stringify({
					type: "cursor-off",
				})
			),
		}).state;
	}

	/* 
		dataString: text|file|from|to
		span: html span elemen
	*/
	async startHoverEffect(dataString: string, span: HTMLSpanElement) {
		// Mutex, prevent concurrent access to following section of code
		if (state.values[2] != null) return;
		state = state.update({
			effects: hoverEffect.of(
				JSON.stringify({
					type: "hover-start",
				})
			),
		}).state;

		if (state.values[3] != null && state.values[3].dataString == dataString) {
			const data = state.values[3];
			state = state.update({
				effects: hoverEffect.of(
					JSON.stringify(Object.assign(data, { type: "hover" }))
				),
			}).state;
			return;
		}

		// data stored in span element
		let [text, file, from, to] = dataString.split("|");

		let leavesByTab = collectLeavesByTabHelper();
		let currTabIdx = getCurrentTabIndex(leavesByTab, span);

		if (currTabIdx != -1) {
			// && currTab != -1) {
			// Check adjacent tabs for file and open file if needed
			const newLeaf = await openFileInAdjacentTab(
				leavesByTab,
				currTabIdx,
				file
			);
			if (newLeaf) {
				state = state.update({
					effects: hoverEffect.of(
						JSON.stringify({
							type: "hover",
							leafId: newLeaf.id,
						})
					),
				}).state;
			}

			leavesByTab = collectLeavesByTabHelper();

			// highlight reference in the right tab
			if (leavesByTab[currTabIdx + 1]) {
				const data = highlightHoveredText(dataString, currTabIdx + 1);
				if (data) {
					state = state.update({
						effects: hoverEffect.of(
							JSON.stringify(Object.assign(data, { type: "hover" }))
						),
					}).state;
				}
				return;
			}

			// highlight reference in the left tab
			if (leavesByTab[currTabIdx - 1]) {
				const data = highlightHoveredText(dataString, currTabIdx - 1);
				if (data) {
					state = state.update({
						effects: hoverEffect.of(
							JSON.stringify(Object.assign(data, { type: "hover" }))
						),
					}).state;
				}
				return;
			}
		}
	}

	async endHoverEffect() {
		const leavesByTab = collectLeavesByTabHelper();
		if (!state.values[2]) return;
		const { tabIdx, index, dataString, leafId, originalTop, originalCursor } =
			state.values[2];

		if (state.values[3] != null && state.values[3].dataString == dataString) {
			// End mutex lock
			state = state.update({
				effects: hoverEffect.of(
					JSON.stringify({
						type: "hover-off",
					})
				),
			}).state;
			return;
		}
		if (dataString) {
			let [text, file, from, to] = dataString.split("|");
			let rangeStart = parseEditorPosition(from);
			let rangeEnd = parseEditorPosition(to);

			let targetLeaf = leavesByTab[tabIdx][1][index];
			// this.app.workspace.setActiveLeaf(targetLeaf);
			const editor = targetLeaf.view.editor;

			editor.replaceRange(
				text,
				rangeStart,
				Object.assign({}, rangeEnd, { ch: rangeEnd.ch + 6 })
			);
			editor.scrollIntoView(
				{
					from: rangeStart,
					to: rangeEnd,
				},
				true
			);
			// console.log(selection);

			console.log("originalTop: " + originalTop);
			if (leafId) {
				await targetLeaf.detach();
			}
			// SCROLL TO ORIGINAL POSITION???

			// else if (originalTop) {
			// 	// console.log(editor);
			// 	// console.log(editor.containerEl);
			// 	// console.log(editor.containerEl.querySelector(".cm-scroller"));
			// 	console.log(
			// 		"starting scroll top: " +
			// 			editor.containerEl.querySelector(".cm-scroller").scrollTop
			// 	);
			// 	// editor.containerEl.querySelector(".cm-scroller").scrollTop =
			// 	// 	originalTop;
			// 	// editor.blur();
			// 	// if (targetLeaf.view instanceof MarkdownView) {
			// 	// 	targetLeaf.view.applyScroll(originalTop);
			// 	// }
			// 	// editor.blur();
			// 	console.log(editor.containerEl.querySelector(".cm-scroller"));
			// 	// editor.cm.dom.querySelector(".cm-scroller").scrollTo(null, originalTop);
			// 	console.log(editor.cm.dom);
			// 	console.log(
			// 		"ending scroll top: " +
			// 			editor.containerEl.querySelector(".cm-scroller").scrollTop
			// 	);
			// }
		}

		// End mutex lock
		state = state.update({
			effects: hoverEffect.of(
				JSON.stringify({
					type: "hover-off",
				})
			),
		}).state;
	}

	async onload() {
		await this.loadSettings();

		// that = this;

		state = state.update({
			annotations: myAnnotation.of(this),
		}).state;

		this.registerEditorExtension([
			// emptyLineGutter,
			placeholders,
			// emojiListField,
			highlights,
		]);

		this.registerDomEvent(document, "mousemove", async (evt) => {
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

			if (dataString && span && span instanceof HTMLSpanElement) {
				this.startHoverEffect(dataString, span);
			} else if (state.values[2] != null) {
				console.log("MOUSEOUT");
				// console.log(evt);
				this.endHoverEffect();
			}
		});

		this.registerDomEvent(document, "keydown", async (evt) => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			const cursorFrom = activeView?.editor.getCursor("from");
			const cursorTo = activeView?.editor.getCursor("to");

			console.log(cursorFrom);
			console.log(cursorTo);

			if (
				cursorFrom &&
				cursorTo &&
				cursorFrom.ch == cursorTo.ch &&
				cursorFrom.line == cursorTo.line &&
				cursorFrom.ch - 1 >= -1
			) {
				const lineText = activeView?.editor.getLine(cursorFrom.line);

				// Match the regex pattern to lineText
				const regex = /\(\(\(([\s\S]*?)\)\)\)/g;
				// from possible regex matches in lineText
				if (lineText) {
					const matches = [...lineText.matchAll(regex)];
					console.log(matches);
					let matched = false;
					matches.forEach((match) => {
						if (match.index?.toString()) {
							const start = match.index;
							const end = start + match[0].length;
							if (end == cursorTo.ch && evt.target) {
								const dataString = match[1];
								// get the html element at the match location
								const container: any = evt.target;
								// find html span element in target that has a data attribute equal to contents
								let span = container.querySelector(
									`span[data="${dataString}"]`
								);
								if (span && span instanceof HTMLSpanElement) {
									console.log("Found span element:", span);
									// Do something with the span element
									this.startCursorEffect(dataString, span);
									matched = true;
								} else {
									console.log("Span element not found");
								}
							}
						}
					});

					if (!matched) {
						this.endCursorEffect();
					}
				}
			}

			if (evt.key == "c" && evt.metaKey && evt.shiftKey) {
				console.log("c");
				updateClipboard();
			} else if (evt.key == "d" && evt.metaKey && evt.shiftKey) {
				console.log("d");
				updateClipboard(true);
			} else if (evt.key == "z" && evt.metaKey) {
				console.log("z");
				console.log(evt.target);
			} else if (evt.key == "v" && evt.metaKey) {
				console.log("v");
				console.log(evt.target);
			}
		});

		this.registerEvent(
			this.app.workspace.on("editor-change", async (editor, info) => {
				console.log("editorChange");
				console.log(editor);
				console.log(info);
			})
		);

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

		this.addSettingTab(new MyHighlightPluginSettingTab(this.app, this));
	}

	onunload() {}

	handleCursorActivity(cm: any) {
		console.log("cursor activity");
		console.log(cm);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onFileOpenOrSwitch() {
		// console.log("file open");
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
	}
}
