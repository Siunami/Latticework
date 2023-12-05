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
	Text,
} from "@codemirror/state";

import {
	getSearchQuery,
	SearchQuery,
	SearchCursor,
	search,
} from "@codemirror/search";

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

let references = StateField.define<any[]>({
	create() {
		return [];
	},
	update(value, tr) {
		if (tr.effects.length > 0) {
			try {
				let data = JSON.parse(tr.effects[0].value);
				if (data.type == "reference") {
					return Object.assign(value, data.references);
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
				if (data.type == "hover-start") {
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
	extensions: [that, references, hoverElement, cursorElement],
});

const thatAnnotation = Annotation.define<any>();
const hoverEffect = StateEffect.define<string>();
const cursorEffect = StateEffect.define<string>();
const referenceEffect = StateEffect.define<string>();

// /* GUTTER */
// const emptyMarker = new (class extends GutterMarker {
// 	toDOM() {
// 		return document.createTextNode("ø");
// 	}
// })();

// const emptyLineGutter = gutter({
// 	lineMarker(view, line) {
// 		return line.from == line.to ? emptyMarker : null;
// 	},
// 	initialSpacer: () => emptyMarker,
// });

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
	return { adjacentTabs, rightAdjacentTab, leftAdjacentTab, index };
}

async function openFileInAdjacentTab(
	leavesByTab: any[],
	currTabIdx: number,
	file: string
) {
	let { adjacentTabs, rightAdjacentTab, leftAdjacentTab, index } =
		getAdjacentTabs(leavesByTab, currTabIdx, file);
	const { workspace } = state.values[0].app;

	// there are no adjacent tabs
	if (adjacentTabs.length == 0) {
		const currLeaf = workspace.getLeaf();
		let newLeaf = workspace.createLeafBySplit(currLeaf);
		await openFileInLeaf(newLeaf, file);
		return { newLeaf, currLeaf: null };
	} else if (index == -1) {
		// leaf doesn't exist in either adjacent tab
		let adjacentTab;
		if (leavesByTab[currTabIdx + 1]) adjacentTab = leavesByTab[currTabIdx + 1];
		else if (leavesByTab[currTabIdx - 1])
			adjacentTab = leavesByTab[currTabIdx - 1];

		if (adjacentTab) {
			let tab = adjacentTab[0];
			let newLeaf: any = workspace.createLeafInParent(tab, 0);
			await openFileInLeaf(newLeaf, file);
			return { newLeaf, currLeaf: null };
		}
	} else {
		// leaf exists in adjacent tab
		let leftFiles = leftAdjacentTab.map((leaf: any) => {
			return leaf.state.file;
		});
		let rightFiles = rightAdjacentTab.map((leaf: any) => {
			return leaf.state.file;
		});

		if (rightFiles.includes(file)) {
			let fileIndex = rightFiles.findIndex((x: any) => x == file);
			let targetLeafId = leavesByTab[currTabIdx + 1][1][fileIndex].id;
			let targetLeaf = await workspace.getLeafById(targetLeafId);
			await workspace.setActiveLeaf(targetLeaf);
			return { currLeaf: targetLeaf, newLeaf: null };
		} else {
			let fileIndex = leftFiles.findIndex((x: any) => x == file);
			let targetLeafId = leavesByTab[currTabIdx - 1][1][fileIndex].id;
			let targetLeaf = await workspace.getLeafById(targetLeafId);
			await workspace.setActiveLeaf(targetLeaf);
			return { currLeaf: targetLeaf, newLeaf: null };
		}
	}
	return { newLeaf: null, currLeaf: null };
}

async function openFileInLeaf(newLeaf: any, file: string) {
	let targetFile: any = this.app.vault.getAbstractFileByPath(file);
	await newLeaf.openFile(targetFile, { active: false });
}

function processURI(dataString: string) {
	let [prefix, text, suffix, file, from, to] = dataString.split(":");
	prefix = decodeURIComponentString(prefix);
	text = decodeURIComponentString(text);
	suffix = decodeURIComponentString(suffix);
	file = decodeURIComponentString(file);
	from = decodeURIComponentString(from);
	to = decodeURIComponentString(to);
	return [prefix, text, suffix, file, from, to];
}

function findTextPositions(
	view: MarkdownView,
	searchTerm: string,
	prefix: string = "",
	suffix: string = ""
) {
	const editor = view.editor;

	// const test = new SearchCursor(Text.of(activeLeaf.view.data), searchTerm);
	// given text and search term, find all matches

	let rollingIndex = 0;
	const text = view.data;
	const lines = text.split("\n").map((line: string, i: number) => {
		let data = { line, index: rollingIndex, length: line.length + 1, i };
		rollingIndex += data.length;
		return data;
	});

	if (text.includes(prefix + searchTerm + suffix)) {
		let matchIndex = text.indexOf(prefix + searchTerm + suffix);
		let startIndex =
			lines.findIndex((line: any) => line.index > matchIndex + prefix.length) -
			1;
		let endIndex =
			lines.findIndex(
				(line: any) =>
					line.index > matchIndex + prefix.length + searchTerm.length
			) - 1;

		const selection = editor.getRange(
			{
				line: startIndex,
				ch: matchIndex + prefix.length - lines[startIndex].index,
			},
			{
				line: endIndex,
				ch:
					matchIndex +
					prefix.length +
					searchTerm.length -
					lines[endIndex].index,
			}
		);

		return {
			rangeStart: {
				line: startIndex,
				ch: matchIndex + prefix.length - lines[startIndex].index,
			},
			rangeEnd: {
				line: endIndex,
				ch:
					matchIndex +
					prefix.length +
					searchTerm.length -
					lines[endIndex].index,
			},
			lines,
		};
	}
	return null;
}

function highlightHoveredReference(
	dataString: string,
	tabIdx: number,
	scrollTo: boolean = true
) {
	console.log("GOT TO HIGHLIGHT HOVERED");
	let [prefix, text, suffix, file, from, to] = processURI(dataString);
	console.log(processURI(dataString));
	// let rangeStart = parseEditorPosition(from);
	// let rangeEnd = parseEditorPosition(to);
	const leavesByTab = collectLeavesByTabHelper();
	let rightAdjacentTab = leavesByTab[tabIdx][1].map((leaf: any) =>
		leaf.getViewState()
	);
	let index = rightAdjacentTab.findIndex((x: any) => x.state.file == file);
	if (index != -1) {
		let targetLeaf = leavesByTab[tabIdx][1][index];

		this.app.workspace.setActiveLeaf(targetLeaf);

		// let elements = [...targetLeaf.containerEl.querySelectorAll("[reference]")];
		// let elementIndex = elements
		// 	.map((el) => JSON.parse(el.getAttribute("reference")).dataString)
		// 	.indexOf(dataString);

		// console.log(elements);
		// let element = elements[elementIndex];
		// // let bbox = element.getBoundingClientRect();
		// // console.log(element);
		// // console.log(targetLeaf.view.editor);
		// // let scrollTop = targetLeaf.view.editor.getScrollInfo().top;

		// element.style.backgroundColor = "rgb(187, 215, 230)";
		// state = state.update({
		// 	effects: hoverEffect.of(
		// 		JSON.stringify({
		// 			type: "hover",
		// 			referenceLeafId: targetLeaf.id,
		// 		})
		// 	),
		// }).state;

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
		// const selection = editor.getRange(rangeStart, rangeEnd);

		// console.log("selection");
		// console.log(selection);
		// if (selection != text) {
		// 	console.log("selection != text");
		// 	console.log(text);
		// 	let positions = findTextPositions(targetLeaf.view, text, prefix, suffix);
		// 	if (positions) {
		// 		rangeStart = positions.rangeStart;
		// 		rangeEnd = positions.rangeEnd;
		// 	}
		// }
		let positions = findTextPositions(
			targetLeaf.view,
			text,
			prefix.slice(0, prefix.length - 1),
			suffix.slice(1, suffix.length)
		);
		if (!positions) {
			state = state.update({
				effects: hoverEffect.of(
					JSON.stringify({
						type: "hover-off",
					})
				),
			}).state;

			return; // returns like this just break the program, should handle more gracefully. This messes up the internal hover state
		}
		let rangeStart = positions.rangeStart;
		let rangeEnd = positions.rangeEnd;

		const originalScroll = editor.getScrollInfo();
		const originalCursor = editor.getCursor();

		const ranges = [];

		let lines = text.split("\n");
		let currIndex = 0;

		// function shiftIfBullet(rangeStart) {}

		if (rangeStart.line != rangeEnd.line) {
			let start = rangeStart.line;
			let end = rangeEnd.line;
			let curr = start;
			while (curr <= end) {
				if (curr == start) {
					editor.replaceRange(
						`+++${decodeURIComponentString(lines[currIndex])}+++`,
						rangeStart,
						{
							line: curr,
							ch: editor.getLine(curr).length,
						}
					);
					ranges.push([
						lines[currIndex],
						rangeStart,
						{
							line: curr,
							ch: editor.getLine(curr).length,
						},
					]);
					curr++;
				} else if (curr == end) {
					let listItemIndex = listItemLength(lines[currIndex]);
					let listItemText = lines[currIndex].slice(
						listItemIndex,
						lines[currIndex].length
					);
					editor.replaceRange(
						`+++${decodeURIComponentString(listItemText)}+++`,
						{
							line: curr,
							ch: listItemIndex,
						},
						rangeEnd
					);
					ranges.push([
						listItemText,
						{
							line: curr,
							ch: listItemIndex,
						},
						Object.assign({}, rangeEnd, { ch: rangeEnd.ch + 6 }),
					]);
					curr++;
				} else {
					let listItemIndex = listItemLength(lines[currIndex]);
					let listItemText = lines[currIndex].slice(
						listItemIndex,
						lines[currIndex].length
					);
					editor.replaceRange(
						`+++${decodeURIComponentString(listItemText)}+++`,
						{
							line: curr,
							ch: listItemIndex,
						},
						{
							line: curr,
							ch: editor.getLine(curr).length,
						}
					);
					ranges.push([
						listItemText,
						{
							line: curr,
							ch: listItemIndex,
						},
						{
							line: curr,
							ch: editor.getLine(curr).length,
						},
					]);
					curr++;
				}
				currIndex++;
			}
		} else {
			editor.replaceRange(
				`+++${decodeURIComponentString(text)}+++`,
				rangeStart,
				rangeEnd
			);
			ranges.push([
				text,
				rangeStart,
				Object.assign({}, rangeEnd, { ch: rangeEnd.ch + 6 }),
			]);
		}

		if (scrollTo) {
			editor.scrollIntoView(
				{
					from: rangeStart,
					to: rangeEnd,
				},
				true
			);
		}

		return {
			tabIdx,
			index,
			dataString,
			originalTop: originalScroll.top,
			originalCursor,
			ranges,
		};
	}
	state = state.update({
		effects: hoverEffect.of(
			JSON.stringify({
				type: "hover-off",
			})
		),
	}).state;
	return null;
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
			tabIdx,
			index,
			dataString,
			originalTop: originalScroll.top,
			originalCursor,
		};
	}

	return null;
}

function encodeURIComponentString(str: string): string {
	return encodeURIComponent(str).replace(/[:()]/g, function (c) {
		return "%" + c.charCodeAt(0).toString(16);
	});
}

function decodeURIComponentString(str: string) {
	return decodeURIComponent(
		str.replace(/%3A/g, ":").replace(/%28/g, "(").replace(/%29/g, ")")
	);
}

// [↗](urn:Also-: hopefully fix the multi-line reference:-%0A- URNs:11-23 Todo.md)
// [↗](urn:PREFIX-:TEXT:-SUFFIX:FILE:STARTINDEX:ENDINDEX)
async function updateClipboard(only: boolean = false) {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);

	// Make sure the user is editing a Markdown file.
	if (view) {
		let selection = view.editor.getSelection();
		// selection = selection.split("\n").join(" ");

		if (view.file) {
			// let reference = `(((${selection}|${view.file.path}|${
			// 	view.editor.getCursor("from").line +
			// 	"," +
			// 	view.editor.getCursor("from").ch
			// }|${
			// 	view.editor.getCursor("to").line + "," + view.editor.getCursor("to").ch
			// })))`;

			const text = view.data;
			const from = view.editor.getCursor("from");
			const to = view.editor.getCursor("to");

			// problem, I'm not dealing with "\n" correctly. Then note slicing the right parts
			// slow down, walk through this part, line by line. Understand it deeply.
			let rollingIndex = 0;
			const lines = text.split("\n").map((line: string, i: number) => {
				let data = { line, index: rollingIndex, length: line.length + 1, i };
				rollingIndex += data.length;
				return data;
			});

			let startIndex = lines.filter((line: any) => line.i == from.line)[0];
			startIndex = startIndex.index + from.ch;
			let endIndex = lines.filter((line: any) => line.i == to.line)[0];
			endIndex = endIndex.index + to.ch;

			// .reduce((a: any, b: any) => a + b, 0);
			let prefix = text.slice(
				startIndex - 25 > 0 ? startIndex - 25 : 0,
				startIndex
			);
			let suffix = text.slice(endIndex, endIndex + 25);

			let reference = `[↗](urn:${encodeURIComponentString(
				prefix
			)}-:${encodeURIComponentString(selection)}:-${encodeURIComponentString(
				suffix
			)}:${encodeURIComponentString(view.file.path)}:${encodeURIComponentString(
				view.editor.getCursor("from").line +
					"," +
					view.editor.getCursor("from").ch
			)}:${encodeURIComponentString(
				view.editor.getCursor("to").line + "," + view.editor.getCursor("to").ch
			)})`;

			if (!only) {
				reference = '"' + selection + '" ' + reference;
			}

			// Write the selected text to the clipboard
			await navigator.clipboard.writeText(reference);
		}
	}
}

function listItemLength(line: string) {
	// Matches lines that start with a bullet (either -, *, or + followed by a space)
	const bulletRegex = /^(\s*[-*+]\s+)/;

	// Matches lines that start with a number followed by a dot and a space (like "1. ")
	const numberRegex = /^(\s*\d+\.\s+)/;

	let match = line.match(bulletRegex) || line.match(numberRegex);
	return match ? match[0].length : 0;
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

		// span.style.backgroundColor = "rgb(187, 215, 230)";
		span.style.color = "black";
		span.setAttribute("class", "old-block");
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

/* new placeholder */
class ReferenceWidget extends WidgetType {
	constructor(private name: string, private view: EditorView) {
		super();
	}

	eq(other: ReferenceWidget) {
		return this.name === other.name;
	}

	toDOM() {
		// if (this.name.split("|").length != 4) {
		// 	console.log("invalid placeholder");
		// 	const regex = /\[↗\]\(urn:([^)]*)\)/g;
		// 	let match = regex.exec(this.name);
		// 	const content = match[1];
		// 	console.log(content); // Output: 'example'
		// 	console.log(content.split(":"));
		// }
		const span = document.createElement("span");

		// span.style.backgroundColor = "rgb(187, 215, 230)";
		span.style.color = "black";
		span.setAttribute("class", "block");
		const regex = /\[↗\]\(urn:([^)]*)\)/g;
		let match = regex.exec(this.name);
		if (match) {
			const content = match[1];
			span.setAttribute("data", content);
		}

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "16");
		svg.setAttribute("height", "16");
		svg.setAttribute("viewBox", "0 0 16 16");
		svg.setAttribute("fill", "none");
		svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("d", "M8 16L0 8L8 0L16 8L8 16Z");
		path.setAttribute("fill", "yellow");

		svg.appendChild(path);
		span.appendChild(svg);

		span.addEventListener("mouseenter", async () => {
			span.style.backgroundColor = "rgb(187, 215, 230)";
		});

		span.addEventListener("mouseleave", async () => {
			span.style.backgroundColor = "rgba(0, 0, 0, 0)";
		});

		span.addEventListener("click", async () => {
			// console.log("click");
			// console.log(this);
			const { workspace } = state.values[0].app;
			const leavesByTab = collectLeavesByTabHelper();

			const { tabIdx, index, dataString, leafId } = state.values[2];
			/* If temporary, then keep leaf */
			if (dataString) {
				let [prefix, text, suffix, file, from, to] = processURI(dataString);
				let rangeEnd = parseEditorPosition(to);
				/*
					The problem here is that I don't have the position of the span element.
					I want to set the active cursor to the end of the span
				*/

				// let [text2, file2, from2, to2] = this.name.split("|");
				// const currentTab = getHoveredTab(leavesByTab, span);
				// // console.log("currentTab");
				// // console.log(currentTab);
				// let rangeEnd2 = parseEditorPosition(to2);

				// const lineText = currentTab?.view?.editor.getLine(rangeEnd2.line);
				// // console.log(lineText);
				// // currentTab.view.editor.setCursor(rangeEnd2);

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

const referenceDecoration = (match: RegExpExecArray, view: EditorView) =>
	Decoration.replace({
		widget: new ReferenceWidget(match[0], view),
	});

const referenceMatcher = new MatchDecorator({
	// regexp: /\(\((\w+)\)\)/g,
	// regexp: /\[\u2197\]\(urn:[^\)]*\)/g,
	regexp: /\[\u2197\]\(urn:[\s\S^\)]*\)/g,
	// regexp: /\(\(([^|)]+)\|([^|)]+)\|([^|)]+)\|([^|)]+)\)\)/g,
	// regexp: /\(\(([^-*]+)-\*-([^-*]+)-\*-([^-*]+)-\*-([^-*]+)\)\)/g,
	decoration: (match, view, pos) => {
		return referenceDecoration(match, view);
	},
});

const referenceResources = ViewPlugin.fromClass(
	class {
		referenceResources: DecorationSet;
		constructor(view: EditorView) {
			this.referenceResources = referenceMatcher.createDeco(view);
		}
		update(update: ViewUpdate) {
			this.referenceResources = referenceMatcher.updateDeco(
				update,
				this.referenceResources
			);
		}
		destroy() {
			this.referenceResources = Decoration.none;
		}
	},
	{
		decorations: (instance) => instance.referenceResources,
		provide: (plugin) =>
			EditorView.atomicRanges.of((view) => {
				return view.plugin(plugin)?.referenceResources || Decoration.none;
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

	// Need to do cleanup, any highlights that are still present
	// Or on reload command

	// need to load all pages and process any backlinks

	// This function would save the SVG as a file and return the path.
	async saveSvgAsFile(svgContent: string, filename: string): Promise<string> {
		const fileUri = `./links/${filename}.svg`;
		// Make sure to handle path creation and check if a file already exists if needed.

		await this.app.vault.adapter.write(fileUri, svgContent);

		return fileUri;
	}

	async startBacklinkEffect(span: HTMLSpanElement) {
		let source = state.values[2];
		let destination = state.values[3];
		let stateMutation = hoverEffect;

		console.log(source);
		// Mutex, prevent concurrent access to following section of code
		if (source != null) return;
		state = state.update({
			effects: stateMutation.of(
				JSON.stringify({
					type: `hover-start`,
				})
			),
		}).state;

		let dataString;
		let reference: any = span.getAttribute("reference");
		if (reference) {
			dataString = JSON.parse(reference).dataString;
			reference = JSON.parse(reference);
		}
		console.log(dataString);
		console.log(reference);
		if (!dataString || !reference) return;

		if (destination != null && destination.dataString == dataString) {
			const data = destination;
			state = state.update({
				effects: hoverEffect.of(
					JSON.stringify(Object.assign(data, { type: "hover" }))
				),
			}).state;
			return;
		}

		let [prefix, text, suffix, file, from, to] = dataString.split(":");
		let sourceFile = reference.sourceFile;

		let leavesByTab = collectLeavesByTabHelper();
		let currTabIdx = getCurrentTabIndex(leavesByTab, span);
		console.log(currTabIdx);

		const data = highlightHoveredReference(dataString, currTabIdx, false);
		if (data) {
			console.log(data);
			state = state.update({
				effects: stateMutation.of(
					JSON.stringify(Object.assign(data, { type: "hover" }))
				),
			}).state;
		}

		if (currTabIdx != -1) {
			// 	// && currTab != -1) {
			// 	// Check adjacent tabs for file and open file if needed
			const { newLeaf, currLeaf } = await openFileInAdjacentTab(
				leavesByTab,
				currTabIdx,
				decodeURIComponentString(sourceFile)
			);
			if (newLeaf) {
				state = state.update({
					effects: stateMutation.of(
						JSON.stringify({
							type: "hover",
							leafId: newLeaf.id,
						})
					),
				}).state;
			}

			console.log("currLeaf");
			console.log(currLeaf);
			if (currLeaf) {
				let elements = [...currLeaf.containerEl.querySelectorAll("[data]")];
				let elementIndex = [...currLeaf.containerEl.querySelectorAll("[data]")]
					.map((el) => el.getAttribute("data"))
					.indexOf(dataString);

				// let element = currLeaf.containerEl.querySelector(
				// 	`[data='${dataString}']`
				// );
				let element = elements[elementIndex];
				let bbox = element.getBoundingClientRect();
				console.log(element);
				console.log(currLeaf.view.editor);
				let scrollTop = currLeaf.view.editor.getScrollInfo().top;

				currLeaf.view.editor.scrollTo(0, scrollTop + (bbox.top - 300));

				console.log(element);
				element.style.backgroundColor = "rgb(187, 215, 230)";
				state = state.update({
					effects: stateMutation.of(
						JSON.stringify({
							type: "hover",
							hoveredLeafId: currLeaf.id,
						})
					),
				}).state;
			}
		}
	}

	async startReferenceEffect(span: HTMLSpanElement, type: string) {
		let source = type == "hover" ? state.values[2] : state.values[3];
		let destination = type == "hover" ? state.values[3] : state.values[2];
		let stateMutation = type == "hover" ? hoverEffect : cursorEffect;

		// Mutex, prevent concurrent access to following section of code
		if (source != null) return;
		state = state.update({
			effects: stateMutation.of(
				JSON.stringify({
					type: `${type}-start`,
				})
			),
		}).state;

		let dataString = span.getAttribute("data");
		if (!dataString) {
			state = state.update({
				effects: hoverEffect.of(
					JSON.stringify({
						type: "hover-off",
					})
				),
			}).state;
			return;
		}

		if (destination != null && destination.dataString == dataString) {
			const data = destination;
			state = state.update({
				effects: hoverEffect.of(JSON.stringify(Object.assign(data, { type }))),
			}).state;
			return;
		}

		let [prefix, text, suffix, file, from, to] = dataString.split(":");

		let leavesByTab = collectLeavesByTabHelper();
		let currTabIdx = getCurrentTabIndex(leavesByTab, span);

		console.log(currTabIdx);

		if (currTabIdx != -1) {
			// && currTab != -1) {
			// Check adjacent tabs for file and open file if needed
			const { newLeaf } = await openFileInAdjacentTab(
				leavesByTab,
				currTabIdx,
				decodeURIComponentString(file)
			);
			if (newLeaf) {
				state = state.update({
					effects: stateMutation.of(
						JSON.stringify({
							type,
							leafId: newLeaf.id,
						})
					),
				}).state;
			}

			leavesByTab = collectLeavesByTabHelper();

			// highlight reference in the right tab
			if (leavesByTab[currTabIdx + 1]) {
				const data = highlightHoveredReference(dataString, currTabIdx + 1);
				if (data) {
					state = state.update({
						effects: stateMutation.of(
							JSON.stringify(Object.assign(data, { type }))
						),
					}).state;
				}
				return;
			}

			// highlight reference in the left tab
			if (leavesByTab[currTabIdx - 1]) {
				const data = highlightHoveredReference(dataString, currTabIdx - 1);
				if (data) {
					state = state.update({
						effects: stateMutation.of(
							JSON.stringify(Object.assign(data, { type }))
						),
					}).state;
				}
				return;
			}
		}
	}

	addReferencesToLeaf(leaf: any) {
		const references = state.values[1];
		console.log("addReferencesToLeaf");
		console.log(references);

		const title =
			leaf.containerEl.querySelector(".view-header-title").innerHTML + ".md";
		const leafReferences = references.filter((x: any) => x.file == title);

		let editor = leaf.view.editor;
		leafReferences.forEach((reference: any) => {
			const { from, to } = reference;
			const rangeStart = parseEditorPosition(from);
			const rangeEnd = parseEditorPosition(to);
			const pos = editor.posToOffset(rangeStart);

			const title = leaf.containerEl.querySelector(".inline-title");
			const titleBbox = title.getBoundingClientRect();
			const line = leaf.containerEl.querySelector(".cm-line");
			const lineBbox = line.getBoundingClientRect();
			const bbox = editor.cm.coordsAtPos(pos);

			if (bbox) {
				const span = document.createElement("span");
				// span.style.backgroundColor = "rgb(187, 215, 230)";
				span.style.color = "black";
				span.style.position = "absolute";
				span.style.top = bbox.top - titleBbox.top + 20 + "px";
				// span.style.top = 0 + "px";
				span.style.left = lineBbox.width + 50 + "px";
				// span.style.left = 0 + "px";
				// span.setAttribute("class", "block");
				span.setAttribute("reference", JSON.stringify(reference));

				span.addEventListener("mouseenter", async () => {
					span.style.backgroundColor = "rgb(187, 215, 230)";
					// this.startReferenceEffect(span, "cursor");
				});

				span.addEventListener("mouseleave", async () => {
					span.style.backgroundColor = "rgba(0, 0, 0, 0)";
					// this.endCursorEffect();
				});

				const svg = document.createElementNS(
					"http://www.w3.org/2000/svg",
					"svg"
				);
				svg.setAttribute("width", "16");
				svg.setAttribute("height", "16");
				svg.setAttribute("viewBox", "0 0 16 16");
				svg.setAttribute("fill", "none");
				svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

				const path = document.createElementNS(
					"http://www.w3.org/2000/svg",
					"path"
				);
				path.setAttribute("d", "M8 16L0 8L8 0L16 8L8 16Z");
				path.setAttribute("fill", "yellow");

				svg.appendChild(path);
				span.appendChild(svg);

				span.addEventListener("click", async () => {
					console.log("click");
					console.log(reference.text);
					const { workspace } = state.values[0].app;
					const leavesByTab = collectLeavesByTabHelper();

					const { tabIdx, index, dataString, leafId } = state.values[2];
					/* If temporary, then keep leaf */
					if (dataString) {
						let [prefix, text, suffix, file, from, to] = processURI(dataString);
						let rangeEnd = parseEditorPosition(to);
						/*
							The problem here is that I don't have the position of the span element.
							I want to set the active cursor to the end of the span
						*/

						// let [text2, file2, from2, to2] = this.name.split("|");
						// const currentTab = getHoveredTab(leavesByTab, span);
						// // console.log("currentTab");
						// // console.log(currentTab);
						// let rangeEnd2 = parseEditorPosition(to2);

						// const lineText = currentTab?.view?.editor.getLine(rangeEnd2.line);
						// // console.log(lineText);
						// // currentTab.view.editor.setCursor(rangeEnd2);

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

				editor.containerEl.querySelector(".cm-scroller").appendChild(span);
			}
		});
	}

	async startEffect(span: HTMLSpanElement, type: string) {
		let source = type == "hover" ? state.values[2] : state.values[3];
		let destination = type == "hover" ? state.values[3] : state.values[2];
		let stateMutation = type == "hover" ? hoverEffect : cursorEffect;

		// Mutex, prevent concurrent access to following section of code
		if (source != null) return;
		state = state.update({
			effects: stateMutation.of(
				JSON.stringify({
					type: `${type}-start`,
				})
			),
		}).state;

		// if (ranges) {
		// 	ranges.forEach((range: any[]) => {
		// 		editor.replaceRange(range[0], range[1], range[2]);
		// 	});
		// }

		const dataString = span.getAttribute("data");
		if (!dataString) return;

		if (destination != null && destination.dataString == dataString) {
			const data = destination;
			state = state.update({
				effects: hoverEffect.of(JSON.stringify(Object.assign(data, { type }))),
			}).state;
			return;
		}

		let [text, file, from, to] = dataString.split("|");

		let leavesByTab = collectLeavesByTabHelper();
		let currTabIdx = getCurrentTabIndex(leavesByTab, span);

		if (currTabIdx != -1) {
			// && currTab != -1) {
			// Check adjacent tabs for file and open file if needed
			const { newLeaf } = await openFileInAdjacentTab(
				leavesByTab,
				currTabIdx,
				file
			);
			if (newLeaf) {
				state = state.update({
					effects: stateMutation.of(
						JSON.stringify({
							type,
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
						effects: stateMutation.of(
							JSON.stringify(Object.assign(data, { type }))
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
						effects: stateMutation.of(
							JSON.stringify(Object.assign(data, { type }))
						),
					}).state;
				}
				return;
			}
		}
	}

	async endReferenceCursorEffect() {
		const leavesByTab = collectLeavesByTabHelper();
		if (!state.values[3] || Object.keys(state.values[3]).length == 0) {
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

		const {
			tabIdx,
			index,
			dataString,
			leafId,
			originalTop,
			originalCursor,
			ranges,
		} = state.values[3];

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

		let targetLeaf = leavesByTab[tabIdx][1][index];
		// this.app.workspace.setActiveLeaf(targetLeaf);
		const editor = targetLeaf.view.editor;
		console.log(ranges);
		if (ranges) {
			ranges.forEach((range: any[]) => {
				editor.replaceRange(range[0], range[1], range[2]);
			});
		}
		editor.scrollIntoView(
			{
				from: ranges[0][1],
				to: ranges[ranges.length - 1][2],
			},
			true
		);
		// console.log(selection);

		// console.log("originalTop: " + originalTop);
		if (leafId) {
			setTimeout(async () => {
				await targetLeaf.detach();
			}, 100);
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

			// console.log("originalTop: " + originalTop);
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

	async endReferenceHoverEffect() {
		const leavesByTab = collectLeavesByTabHelper();
		if (!state.values[2]) return;
		const {
			tabIdx,
			index,
			dataString,
			leafId,
			hoveredLeafId,
			referenceLeafId,
			originalTop,
			originalCursor,
			ranges,
		} = state.values[2];

		if (!dataString) {
			state = state.update({
				effects: hoverEffect.of(
					JSON.stringify({
						type: "hover-off",
					})
				),
			}).state;
			return;
		}

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

		let targetLeaf = leavesByTab[tabIdx][1][index];
		// this.app.workspace.setActiveLeaf(targetLeaf);
		const editor = targetLeaf.view.editor;
		if (ranges) {
			ranges.forEach((range: any[]) => {
				editor.replaceRange(range[0], range[1], range[2]);
			});
		}
		// editor.scrollIntoView(
		// 	{
		// 		from: ranges[0][1],
		// 		to: ranges[ranges.length - 1][2],
		// 	},
		// 	true
		// );

		// if (referenceLeafId) {
		// 	let leaf: any = await this.app.workspace.getLeafById(referenceLeafId);
		// 	let elements = [...leaf.containerEl.querySelectorAll("[reference]")];
		// 	let elementIndex = elements
		// 		.map((el) => JSON.parse(el.getAttribute("reference")).dataString)
		// 		.indexOf(dataString);

		// 	console.log(elements);
		// 	let element = elements[elementIndex];

		// 	element.style.backgroundColor = "rgba(0, 0, 0, 0)";
		// }

		console.log("hoveredSource");
		console.log(hoveredLeafId);

		if (hoveredLeafId) {
			let leaf: any = await this.app.workspace.getLeafById(hoveredLeafId);
			let elements = [...leaf.containerEl.querySelectorAll("[data]")];
			let elementIndex = [...leaf.containerEl.querySelectorAll("[data]")]
				.map((el) => el.getAttribute("data"))
				.indexOf(dataString);
			let element = elements[elementIndex];

			element.style.backgroundColor = "rgba(0, 0, 0, 0)";
		}

		if (leafId) {
			setTimeout(async () => {
				await this.app.workspace.getLeafById(leafId).detach();
			}, 100);
		}

		// End mutex lock
		state = state.update({
			effects: hoverEffect.of(
				JSON.stringify({
					type: "hover-off",
				})
			),
		}).state;
		console.log(state);
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

			// scroll to cursor hover if it exists
			if (state.values[3] && state.values[3].dataString) {
				console.log("DATASTRING");

				let [text, file, from, to] = state.values[3].dataString.split("|");
				let rangeStart = parseEditorPosition(from);
				let rangeEnd = parseEditorPosition(to);

				editor.scrollIntoView(
					{
						from: rangeStart,
						to: rangeEnd,
					},
					true
				);
			} else {
				editor.scrollIntoView(
					{
						from: rangeStart,
						to: rangeEnd,
					},
					true
				);
			}

			// console.log(selection);

			// console.log("originalTop: " + originalTop);
			if (leafId) {
				setTimeout(async () => {
					await targetLeaf.detach();
				}, 100);
			}
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
		setTimeout(() => {
			let references: any = [];
			let markdownFiles = this.app.vault.getMarkdownFiles();
			Promise.all(markdownFiles.map((file) => this.app.vault.read(file))).then(
				(files) => {
					const zippedArray = markdownFiles.map((file, index) => ({
						markdownFile: file,
						fileData: files[index],
					}));

					zippedArray.forEach((file) => {
						let regex = /\[\u2197\]\(urn:([^)]*)\)/g;

						console.log(file.markdownFile);
						let matches = [...file.fileData.matchAll(regex)];

						matches.forEach((match) => {
							let [prefix, text, suffix, file2, from, to] = processURI(
								match[1]
							);
							references.push({
								prefix,
								text,
								suffix,
								file: file2,
								from,
								to,
								dataString: match[1],
								sourceFile: file.markdownFile.path,
							});
						});
					});

					state = state.update({
						effects: referenceEffect.of(
							JSON.stringify(
								Object.assign(
									{
										type: "reference",
									},
									{ references }
								)
							)
						),
					}).state;
					console.log("references");
					console.log(references);
					const leaves = this.app.workspace.getLeavesOfType("markdown");
					console.log("leaves");
					console.log(leaves);
					leaves.forEach((leaf) => {
						this.addReferencesToLeaf(leaf);
					});
				}
			);
		}, 1000);

		state = state.update({
			annotations: thatAnnotation.of(this),
		}).state;

		this.registerEditorExtension([
			// emptyLineGutter,
			placeholders,
			highlights,
			referenceResources,
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
				// console.log("MOUSEMOVE");
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

			// console.log(state);

			// if (
			// 	dataString &&
			// 	span &&
			// 	span instanceof HTMLSpanElement &&
			// 	span.className.includes("old-block")
			// ) {
			// 	this.startEffect(span, "hover");
			// } else if (dataString && span && span instanceof HTMLSpanElement && !span.className.includes("old-block")) {
			// 	this.startReferenceEffect(span, "hover");
			// } else if (
			// 	state.values[2] != null &&
			// 	state.values[2].dataString.split("|").length == 4
			// ) {
			// 	console.log(state.values[2]);
			// 	// console.log("MOUSEOUT");
			// 	// console.log(evt);
			// 	this.endHoverEffect();
			// } else if (state.values[2] != null) {
			// 	console.log("end hover reference effect");
			// 	this.endReferenceHoverEffect();
			// }

			// console.log(span);

			if (
				dataString &&
				span &&
				span instanceof HTMLSpanElement &&
				!span.className.includes("old-block")
			) {
				console.log("start hover reference effect");
				this.startReferenceEffect(span, "hover");
			} else if (
				span &&
				span instanceof HTMLSpanElement &&
				span.getAttribute("reference")
			) {
				console.log("start reference reference effect");
				this.startBacklinkEffect(span);
			} else if (state.values[2] != null) {
				console.log("end hover reference effect");
				this.endReferenceHoverEffect();
			}
		});

		this.registerDomEvent(document, "click", async (evt) => {
			this.checkFocusCursor(evt);
		});

		this.registerDomEvent(document, "keydown", async (evt) => {
			if (!(evt.key == "z" && evt.metaKey)) {
				// Timeout fix: it doesn't recognize the latest paste change immediately because the paste event might not trigger the DOM change event.
				setTimeout(() => {
					this.checkFocusCursor(evt);
				}, 50);
			} else {
				let { matched, span } = this.checkCursorPositionAtDatastring(evt);

				if (matched) {
					if (
						state.values[2] != null &&
						state.values[3] != null &&
						state.values[2].dataString == state.values[3].dataString
					) {
						console.log("UNDO HOVER");
						state = state.update({
							effects: hoverEffect.of(
								JSON.stringify({
									type: "hover-off",
								})
							),
						}).state;
					}

					console.log("UNDO CURSOR");
					state = state.update({
						effects: cursorEffect.of(
							JSON.stringify({
								type: "cursor-off",
							})
						),
					}).state;
					const activeView =
						this.app.workspace.getActiveViewOfType(MarkdownView);
					activeView?.editor.undo();
				}
			}

			if (evt.key == "c" && evt.metaKey && evt.shiftKey) {
				console.log("c");
				updateClipboard();
			} else if (evt.key == "d" && evt.metaKey && evt.shiftKey) {
				console.log("d");
				updateClipboard(true);
			}
		});

		this.registerEvent(
			this.app.workspace.on("file-open", this.onFileOpenOrSwitch.bind(this))
		);

		this.registerMarkdownPostProcessor((element, context) => {
			const codeblocks = element.findAll("code");

			for (let codeblock of codeblocks) {
				// console.log(codeblock);
			}
		});

		this.addSettingTab(new MyHighlightPluginSettingTab(this.app, this));
	}

	onunload() {
		// this.endHoverEffect();
		// this.endCursorEffect();
		if (state.values[2] && state.values[2].ranges) {
			this.endReferenceHoverEffect();
		}
	}

	checkCursorPositionAtDatastring(evt: Event | { target: HTMLElement }): any {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const cursorFrom = activeView?.editor.getCursor("from");
		const cursorTo = activeView?.editor.getCursor("to");

		// console.log(cursorFrom);
		// console.log(cursorTo);

		let matched = false;
		let matchSpan;
		if (
			cursorFrom &&
			cursorTo &&
			cursorFrom.ch == cursorTo.ch &&
			cursorFrom.line == cursorTo.line
			// &&cursorFrom.ch - 1 >= -1
		) {
			const lineText = activeView?.editor.getLine(cursorFrom.line);
			// console.log(lineText);

			// Match the regex pattern to lineText
			// const regex = /\(\(\(([\s\S]*?)\)\)\)/g;
			const regex = /\[↗\]\(urn:([^)]*)\)/g;
			// from possible regex matches in lineText
			if (lineText) {
				const matches = [...lineText.matchAll(regex)];
				matches.forEach((match) => {
					// console.log(match);
					if (match.index?.toString()) {
						const start = match.index;
						const end = start + match[0].length;
						if (end == cursorTo.ch && evt.target) {
							const dataString = match[1];
							// get the html element at the match location
							const container: any = evt.target;
							// console.log(container);
							// find html span element in target that has a data attribute equal to contents
							let span = container.querySelector(`span[data="${dataString}"]`);
							if (span && span instanceof HTMLSpanElement) {
								console.log("Found span element:", span);
								// Do something with the span element
								matched = true;

								matchSpan = span;
							} else {
								console.log("Span element not found");
							}
						}
					}
				});
			}
		}
		return { matched, span: matchSpan };
	}

	checkFocusCursor(evt: Event | { target: HTMLElement }) {
		let { matched, span } = this.checkCursorPositionAtDatastring(evt);

		console.log(matched);
		if (matched) {
			this.endReferenceCursorEffect();
			// this.startCursorEffect(span);
			// this.startEffect(span, "cursor");
			this.startReferenceEffect(span, "cursor");
		} else {
			this.endReferenceCursorEffect();
		}
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
